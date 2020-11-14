import { System, Groups, Not, Modified } from "hecs";
import { Mesh, Group, DoubleSide, MeshLambertMaterial } from "three";
import { Outline, OutlineApplied } from "../components";
import { WireframeGeometry2 } from "three/examples/jsm/lines/WireframeGeometry2";
import { Wireframe } from "three/examples/jsm/lines/Wireframe";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";
import { Object3D, Shape } from "hecs-plugin-three";

function dashes(n) {
  return Array.apply(null, { length: n })
    .map(function () {
      return "=";
    })
    .join("");
}

export class OutlineSystem extends System {
  order = Groups.Initialization + 50;

  static queries = {
    added: [Outline, Not(OutlineApplied), Object3D],
    removed: [Not(Outline), OutlineApplied],

    shapeModified: [Object3D, Modified(Shape), OutlineApplied],
    // shapeRemoved: [Object3D, Not(Shape), OutlineApplied],
    // objectRemoved: [Not(Object3D), Outline],
  };

  update() {
    this.queries.added.forEach((entity) => {
      this.addOutline(entity);
    });
    this.queries.removed.forEach((entity) => {
      this.removeOutline(entity);
    });

    this.queries.shapeModified.forEach((entity) => {
      this.removeOutline(entity);
    });
  }

  addOutline(entity) {
    const outline = entity.get(Outline);
    const object3d = entity.get(Object3D);
    if (object3d && object3d.value.children.length > 0) {
      this.sendToForeground(object3d.value);
      const clonedObject3d = object3d.value.clone();
      clonedObject3d.position.set(0, 0, 0);
      clonedObject3d.rotation.set(0, 0, 0);
      clonedObject3d.scale.set(1, 1, 1);
      const outlineObject3d = this.outlinify(
        clonedObject3d,
        outline.color,
        outline.thickness
      );
      object3d.value.add(outlineObject3d);
      entity.add(OutlineApplied, { object: outlineObject3d });
    }
  }

  sendToForeground(object3d) {
    object3d.traverse((obj) => {
      // Save state so it can be restored later
      const outline: {
        renderOrder?: number;
        depthTest?: boolean;
      } = {};
      obj.userData.outline = outline;

      outline.renderOrder = obj.renderOrder;
      obj.renderOrder = 4;

      if (obj.material) {
        outline.depthTest = obj.material.depthTest;
        obj.material.depthTest = false;
      }
    });
  }

  removeOutline(entity) {
    const object3d = entity.get(Object3D);
    const applied = entity.get(OutlineApplied);
    if (applied) {
      this.restoreState(object3d.value);
      applied.object.parent.remove(applied.object);
      entity.remove(OutlineApplied);
    }
  }

  outlinify(object, color, thickness, depth = 0) {
    for (const child of object.children) {
      object.remove(child);
      object.add(this.outlinify(child, color, thickness, depth + 1));
    }

    if (object.isMesh) {
      // Group to contain both the mesh & its outline
      const group = new Group();

      const coloredOutline = this.createOutlineMesh(
        object,
        color,
        1.0 + thickness * 2,
        2
      );

      const blackOutline = this.createOutlineMesh(
        object,
        "black",
        1.0 + thickness * 4,
        1
      );

      // Add outline meshes
      group.add(coloredOutline);
      group.add(blackOutline);

      return group;
    } else {
      return object;
    }
  }

  restoreState(object, depth = 0) {
    object.traverse((obj) => {
      const savedState = obj.userData.outline;
      if (!savedState) return;

      if (savedState.renderOrder !== undefined) {
        obj.renderOrder = savedState.renderOrder;
      }

      if (obj.material) {
        obj.material.depthTest = savedState.depthTest;
      }

      delete obj.userData.outline;
    });
  }

  createOutlineMesh(mesh, color, linewidth, renderOrder) {
    const geometry = new WireframeGeometry2(mesh.geometry);
    const material = new LineMaterial({
      color,
      linewidth,
    });
    material.resolution.set(window.innerWidth, window.innerHeight);
    material.depthTest = false;

    const outlineMesh = new Wireframe(geometry, material);
    outlineMesh.computeLineDistances();
    outlineMesh.scale.set(1, 1, 1);
    outlineMesh.renderOrder = renderOrder;

    return outlineMesh;
  }
}
