import type {
  ColliderDesc,
  RigidBody,
  RigidBodyDesc,
  RigidBodyType,
} from "@dimforge/rapier3d";

import { Vector3, Object3D, MathUtils, Box3, Quaternion, Euler } from "three";

import {
  GROUND_INTERACTION,
  NO_INTERACTION,
  OBJECT_INTERACTION,
} from "~/config/colliderInteractions";

import { System, Groups, Not, Modified, Entity } from "~/ecs/base";
import { Object3DRef, Transform } from "~/ecs/plugins/core";

import { Physics } from "../Physics";
import {
  Collider2,
  Collider2Ref,
  ColliderImplicit,
  PhysicsOptions,
} from "../components";
import {
  shapeParamsToColliderDesc,
  toShapeParams,
} from "~/ecs/shared/createShape";
import { DecoratedECSWorld } from "~/types";

type Behavior = {
  interaction: number;
  bodyType: RigidBodyType;
};

const _b3 = new Box3();

export class Collider2System extends System {
  physics: Physics;

  order = Groups.Presentation + 301; // After WorldTransform

  static queries = {
    added: [Collider2, Not(Collider2Ref)],
    modified: [Modified(Collider2), Collider2Ref],
    removed: [Not(Collider2), Collider2Ref, Not(ColliderImplicit)],

    addImplicit: [Object3DRef, Not(Collider2), Not(ColliderImplicit)],
    modifiedImplicit: [Modified(Object3DRef), ColliderImplicit],
    modifiedTransform: [Modified(Transform), Collider2Ref],
  };

  init({ physics }) {
    this.physics = physics;
  }

  update() {
    this.queries.added.forEach((entity) => {
      this.build(entity);
    });

    this.queries.modified.forEach((entity) => {
      this.remove(entity);
      this.build(entity);
    });

    this.queries.removed.forEach((entity) => {
      this.remove(entity);
    });

    this.queries.addImplicit.forEach((entity) => {
      entity.add(ColliderImplicit);
      this.build(entity);
    });
    this.queries.modifiedImplicit.forEach((entity) => {
      this.remove(entity);
      entity.add(ColliderImplicit);
      this.build(entity);
    });
    this.queries.modifiedTransform.forEach((entity) => {
      const transform: Transform = entity.get(Transform);
      const ref: Collider2Ref = entity.get(Collider2Ref);

      ref.body.setTranslation(transform.position, false);
      ref.body.setRotation(transform.rotation, false);
    });
  }

  build(entity: Entity) {
    const transform: Transform = entity.get(Transform);
    let spec: Collider2 = entity.get(Collider2);

    // Implicit collider needs to have bounding box calculated
    let rotation: Quaternion = new Quaternion();
    if (!spec) {
      spec = new Collider2(this.world);
      const object3d: Object3D = entity.get(Object3DRef).value;

      _b3.setFromObject(object3d);
      _b3.getSize(spec.size);

      // The AABB needs to be inverted so that the usual rotation re-aligns it to the world axes
      rotation.copy(transform.rotation).invert();
    }

    const behavior = this.getBehavior(spec.kind);

    const body = this.createRigidBody(entity, behavior);
    this.physics.bodies.set(body.handle, entity);

    const collider = this.createCollider(
      spec,
      body,
      rotation,
      transform.scale,
      behavior
    );
    this.physics.colliders.set(collider.handle, entity);

    entity.add(Collider2Ref, { body, collider });
  }

  createRigidBody(entity: Entity, behavior: Behavior) {
    const { world, rapier } = (this.world as any).physics;
    const transform = entity.get(Transform);

    let bodyDesc: RigidBodyDesc = new rapier.RigidBodyDesc(behavior.bodyType)
      .setTranslation(
        transform.position.x,
        transform.position.y,
        transform.position.z
      )
      .setRotation(transform.rotation);

    let options: PhysicsOptions =
      entity.get(PhysicsOptions) || new PhysicsOptions(world);

    bodyDesc.setLinearDamping(options.linDamp);
    bodyDesc.setAngularDamping(options.angDamp);

    const rr = options.rotRestrict.toUpperCase();
    bodyDesc.restrictRotations(
      !rr.includes("X"),
      !rr.includes("Y"),
      !rr.includes("Z")
    );

    // if (spec.mass) rigidBodyDesc.setAdditionalMass(spec.mass);

    return world.createRigidBody(bodyDesc);
  }

  createCollider(
    collider: Collider2,
    body: RigidBody,
    rotation: Quaternion,
    scale: Vector3,
    behavior: Behavior
  ) {
    const { world, rapier } = (this.world as any).physics;

    const colliderDesc: ColliderDesc = shapeParamsToColliderDesc(
      rapier,
      toShapeParams(collider.shape, collider.size)
    )
      .setActiveCollisionTypes(rapier.ActiveCollisionTypes.ALL)
      .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS)
      .setTranslation(
        collider.offset.x, // * scale.x,
        collider.offset.y, // * scale.y,
        collider.offset.z, // * scale.z
      )
      .setRotation(rotation);

    collider;
    // colliderDesc.setSensor(spec.isSensor);
    colliderDesc.setDensity(MathUtils.clamp(collider.density, 0, 1000));

    // Create the collider, and (optionally) attach to rigid body
    colliderDesc.setCollisionGroups(behavior.interaction);

    return world.createCollider(colliderDesc, body);
  }

  remove(entity) {
    const { world } = (this.world as DecoratedECSWorld).physics;
    const ref: Collider2Ref = entity.get(Collider2Ref);

    world.removeCollider(ref.collider, false);
    this.physics.colliders.delete(ref.collider.handle);

    if (ref.body) {
      world.removeRigidBody(ref.body);
      this.physics.bodies.delete(ref.body.handle);
    }

    entity.remove(Collider2Ref);
    entity.maybeRemove(ColliderImplicit);
  }

  getBehavior(kind: Collider2["kind"]): Behavior {
    const BodyType = this.physics.rapier.RigidBodyType;

    switch (kind) {
      case "ETHEREAL":
        return { interaction: NO_INTERACTION, bodyType: BodyType.Fixed };
      case "SOLID":
        return { interaction: OBJECT_INTERACTION, bodyType: BodyType.Fixed };
      case "GROUND":
        return { interaction: GROUND_INTERACTION, bodyType: BodyType.Fixed };
      case "DYNAMIC":
        return { interaction: OBJECT_INTERACTION, bodyType: BodyType.Dynamic };
      default:
        throw Error(`unknown collider kind ${kind}`);
    }
  }
}