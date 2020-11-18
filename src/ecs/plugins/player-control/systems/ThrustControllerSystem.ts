import { System, Groups } from "hecs";
import { Transform } from "hecs-plugin-core";
import { get } from "svelte/store";

import { keyUp, keyDown, keyLeft, keyRight, keySpace } from "~/input";
import { ThrustController } from "../components";
import { RigidBodyRef } from "~/ecs/plugins/rapier/components/RigidBodyRef";
import { signedAngleBetweenVectors } from "~/utils/signedAngleBetweenVectors";
import { Vector3, Euler, Quaternion } from "three";
import { PointerPlaneRef } from "~/ecs/plugins/pointer-plane";

const bodyFacing = new Vector3();
const thrust = new Vector3();
const vUp = new Vector3(0, 1, 0);
const vOut = new Vector3(0, 0, 1);
const v1 = new Vector3();
const q = new Quaternion();

export class ThrustControllerSystem extends System {
  order = Groups.Simulation;

  static queries = {
    default: [ThrustController, RigidBodyRef],
  };

  update() {
    const directions = {
      up: get(keyUp),
      down: get(keyDown),
      left: get(keyLeft),
      right: get(keyRight),
      jump: get(keySpace),
    };
    this.queries.default.forEach((entity) => {
      this.applyThrust(directions, entity);
    });
  }

  applyThrust(directions, entity) {
    const controller = entity.get(ThrustController);
    const bodyRef = entity.get(RigidBodyRef);
    const transform = entity.get(Transform);

    bodyFacing.copy(vOut);
    bodyFacing.applyQuaternion(transform.rotation);

    thrust.set(
      (directions.left ? -1 : 0) + (directions.right ? 1 : 0),
      directions.jump ? 1 : 0,
      (directions.up ? -1 : 0) + (directions.down ? 1 : 0)
    );
    const angle = signedAngleBetweenVectors(bodyFacing, thrust, vUp);

    bodyFacing.copy(vUp);
    bodyFacing.applyQuaternion(transform.rotation);
    const angleUp = bodyFacing.angleTo(vUp);

    if (thrust.lengthSq() < 0.01) {
      // Do nothing
    } else if (angleUp > Math.PI / 8) {
      // get up
      q.setFromEuler(new Euler(0, 1, 0));
      transform.rotation.slerp(q, 0.1);
    } else if (angle < -Math.PI / 12 || angle > Math.PI / 12) {
      // turn toward direction
      thrust.set(0, Math.sign(angle) * 20, 0);
      bodyRef.value.applyTorque(thrust, true);
      // TODO: suspend head-turning while changing directions
    } else {
      // thrust toward direction
      v1.copy(bodyRef.value.linvel());
      // maximum velocity
      if (v1.length() < 5) {
        thrust.multiplyScalar(controller.thrust);
        bodyRef.value.applyForce(thrust, true);
      }
    }
  }
}
