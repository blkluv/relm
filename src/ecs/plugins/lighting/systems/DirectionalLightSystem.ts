import * as THREE from "three";
import { System, Groups, Not, Modified } from "hecs";
import { ComposableTransform } from "~/ecs/plugins/composable";
import { WorldTransform, Transform } from "hecs-plugin-core";
import { Object3D } from "hecs-plugin-three";

import { DirectionalLight, DirectionalLightRef } from "../components";

import { shadowMapConfig } from "~/world/config";

export class DirectionalLightSystem extends System {
  order = Groups.Initialization;

  static queries = {
    added: [DirectionalLight, Object3D, Not(DirectionalLightRef)],
    active: [DirectionalLight, DirectionalLightRef],
    modified: [Modified(DirectionalLight), DirectionalLightRef],
    removed: [Not(DirectionalLight), DirectionalLightRef],
  };

  init({ presentation }) {
    this.presentation = presentation;
  }

  update() {
    this.queries.added.forEach((entity) => {
      const spec = entity.get(DirectionalLight);
      const light = this.buildLight(
        entity,
        spec.color,
        spec.intensity,
        spec.target
      );
      if (spec.shadow) {
        const frustum = {
          top: spec.shadowTop,
          bottom: spec.shadowBottom,
          left: spec.shadowLeft,
          right: spec.shadowRight,
          near: spec.shadowNear,
          far: spec.shadowFar,
        };
        const resolution = {
          width: spec.shadowWidth,
          height: spec.shadowHeight,
        };
        this.buildShadow(light, spec.shadowRadius, resolution, frustum);
      }
      entity.add(DirectionalLightRef, { value: light });
    });

    //TODO
    this.queries.active.forEach((entity) => {});
    this.queries.modified.forEach((entity) => {});
    this.queries.removed.forEach((entity) => {});
  }

  buildLight(
    entity,
    color: string,
    intensity: number,
    targetEntityId?: string
  ) {
    const object3d = entity.get(Object3D);
    const dirLight = new THREE.DirectionalLight(color, intensity);

    object3d.value.add(dirLight);

    if (targetEntityId) {
      const targetEntity = this.world.entities.getById(targetEntityId);
      if (targetEntity) {
        // DirectionalLight will point towards target entity, if provided
        const target = targetEntity.get(Object3D);
        dirLight.target = target.value;
      } else {
        console.warn(
          `DirectionalLight's target entity is invalid; ` +
            `light will point towards origin`,
          targetEntityId
        );
      }
    } else {
      // If no target entity is provided, DirectionalLight will "float",
      // always pointing in same direction
      dirLight.target.position.x = -object3d.value.position.x;
      dirLight.target.position.y = -object3d.value.position.y;
      dirLight.target.position.z = -object3d.value.position.z;
      object3d.value.add(dirLight.target);
    }

    return dirLight;
  }

  buildShadow(light, radius, resolution, frustum) {
    light.castShadow = true;

    light.shadow.mapSize.height = resolution.height;
    light.shadow.mapSize.width = resolution.width;

    light.shadow.camera.top = frustum.top;
    light.shadow.camera.bottom = frustum.bottom;
    light.shadow.camera.left = frustum.left;
    light.shadow.camera.right = frustum.right;
    light.shadow.camera.near = frustum.near;
    light.shadow.camera.far = frustum.far;

    light.shadow.radius = radius;

    switch (shadowMapConfig) {
      case "BASIC":
      case "PCF":
        break;
      case "VSM":
        light.shadow.bias = -0.001;
        break;
    }
  }
}