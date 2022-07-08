import { StateComponent, RefType } from "~/ecs/base";

export class ColliderRef extends StateComponent {
  value: any;

  static props = {
    value: {
      type: RefType,
    },
  };
}
