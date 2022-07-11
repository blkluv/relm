import { Object3D } from "three";
import { LocalComponent, RefType } from "~/ecs/base";

export class OutlineApplied extends LocalComponent {
  object: Object3D;

  static props = {
    object: {
      type: RefType,
    },
  };
}
