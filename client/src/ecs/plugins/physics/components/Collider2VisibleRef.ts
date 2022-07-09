import type { Mesh } from "three";
import { StateComponent, RefType } from "~/ecs/base";

export class Collider2VisibleRef extends StateComponent {
  value: Mesh;

  static props = {
    value: {
      type: RefType,
    },
  };
}
