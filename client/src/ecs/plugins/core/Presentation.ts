import {
  TextureLoader,
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Texture,
  Vector3,
  Vector2,
  Frustum,
  Matrix4,
  Object3D,
} from "three";

import {
  EffectComposer,
  EffectPass,
  RenderPass,
  BlendFunction,
  OutlineEffect,
  SMAAEffect,
  SMAAPreset,
  SMAAImageLoader,
  EdgeDetectionMode,
} from "postprocessing";

import { World } from "~/ecs/base";

import { IntersectionFinder } from "./IntersectionFinder";
import { Loader } from "./Loader";
import type { SpatialIndex } from "~/ecs/plugins/spatial-index/SpatialIndex";
import { Object3DRef } from ".";
import { SPATIAL_INDEX_THRESHOLD } from "~/config/constants";

export type PlaneOrientation = "xz" | "xy";

let gltfLoader: Loader;
let textureLoader: TextureLoader;

declare class ResizeObserver {
  constructor(fn: () => void);
  observe: (element: HTMLElement) => void;
  unobserve: (element: HTMLElement) => void;
}

export type PresentationOptions = {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
};

export class Presentation {
  world: World;
  viewport: HTMLElement;
  size: Vector2;
  spatial: SpatialIndex;
  frame: number;

  scene: Scene;
  camera: PerspectiveCamera;
  visibleCandidates: Set<Object3D>;

  renderer: WebGLRenderer;
  composer: EffectComposer;

  outlineEffect: OutlineEffect;

  cameraTarget: Vector3;
  resizeObserver: ResizeObserver;
  intersectionFinder: IntersectionFinder;

  skipUpdate: number;
  mouse2d: Vector2;
  mouseMoveListener: (event: MouseEvent) => void;
  touchMoveListener: (event: TouchEvent) => void;

  constructor(world: World, options: PresentationOptions) {
    this.world = world;
    this.viewport = null;
    this.size = new Vector2(1, 1);
    this.frame = 0;

    this.scene = options.scene;
    this.camera = options.camera;
    this.visibleCandidates = new Set();

    this.renderer = options.renderer;
    this.composer = new EffectComposer(this.renderer);

    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // prepare outline effect for outline EffectPass
    this.outlineEffect = new OutlineEffect(this.scene, this.camera, {
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 50,
      // pulseSpeed: 0.5,
      visibleEdgeColor: 0x00ff00,
      hiddenEdgeColor: 0x00aa00,
      blur: true,
      // kernelSize: KernelSize.MEDIUM,
      xRay: true,
      opacity: 1,
      // height: 480,
    });
    // this.outlineEffect.getBlurPass().setScale(2)

    new SMAAImageLoader().load(([searchImage, areaImage]) => {
      const outlinePass = new EffectPass(this.camera, this.outlineEffect);
      // outlinePass.renderToScreen = true;
      this.composer.addPass(outlinePass);

      // Add anti-aliasing last
      this.composer.addPass(
        new EffectPass(
          this.camera,
          new SMAAEffect(
            searchImage,
            areaImage,
            SMAAPreset.HIGH,
            EdgeDetectionMode.COLOR
          )
        )
      );

      // this.composer.addPass(new EffectPass(this.camera, new BloomEffect()));
    });

    this.cameraTarget = null; // can be set later with setCameraTarget
    this.resizeObserver = new ResizeObserver(this.resize.bind(this));
    this.intersectionFinder = new IntersectionFinder(this.camera, this.scene);

    this.skipUpdate = 0;
    this.mouse2d = new Vector2();
    this.mouseMoveListener = this.handleMouseMove.bind(this);
    this.touchMoveListener = this.handleTouchMove.bind(this);

    if (!gltfLoader) gltfLoader = new Loader();

    if (!textureLoader) textureLoader = new TextureLoader();
  }

  handleMouseMove(event: MouseEvent) {
    this.mouse2d.x = event.clientX;
    this.mouse2d.y = event.clientY;
  }

  handleTouchMove(event: TouchEvent) {
    var touches = event.changedTouches;
    this.mouse2d.x = touches[0].clientX;
    this.mouse2d.y = touches[0].clientY;
  }

  setViewport(viewport) {
    if (this.viewport === viewport) {
      return;
    }
    if (this.viewport) {
      this.resizeObserver.unobserve(this.viewport);
      this.viewport.removeEventListener("mousemove", this.mouseMoveListener);
      this.viewport.removeEventListener("touchmove", this.touchMoveListener);
      this.viewport.removeEventListener("touchstart", this.touchMoveListener);
      this.viewport.removeChild(this.renderer.domElement);
      this.viewport = null;
    }
    this.viewport = viewport;
    this.resize();
    if (this.viewport) {
      this.viewport.appendChild(this.renderer.domElement);
      this.viewport.addEventListener("touchstart", this.touchMoveListener);
      this.viewport.addEventListener("touchmove", this.touchMoveListener);
      this.viewport.addEventListener("mousemove", this.mouseMoveListener);
      this.resizeObserver.observe(this.viewport);
    }
  }

  setLoop(fn) {
    this.renderer.setAnimationLoop(fn);
  }

  loadGltf(url) {
    return gltfLoader.load(url);
  }

  async loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      textureLoader.load(url, resolve, null, reject);
    });
  }

  updateSize() {
    this.size.x = this.viewport?.offsetWidth || 1;
    this.size.y = this.viewport?.offsetHeight || 1;
  }

  resize() {
    this.updateSize();
    this.camera.aspect = this.size.x / this.size.y;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(this.size.x, this.size.y);
    if (this.viewport) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setCameraTarget(target: Vector3) {
    this.cameraTarget = target;
  }

  compile() {
    this.renderer.compile(this.scene, this.camera);
  }

  update(delta) {
    if (!this.viewport) return;
    if (this.skipUpdate > 0) {
      this.scene.updateMatrixWorld();
      this.camera.updateMatrixWorld();
      this.skipUpdate--;
      return;
    }

    this.frame++;

    this.renderer.info.reset();

    this.hideOffCameraObjects();

    this.composer.render(delta);

    this.frame++;
  }

  fastFindBetween(source: Vector3, target: Vector3): Object3D[] {
    if (!this.spatial) throw new Error("fastRaycast requires spatial index");

    const raycaster = this.intersectionFinder.prepareRaycastBetween(
      source,
      target
    );
    raycaster.params.Points.threshold = SPATIAL_INDEX_THRESHOLD / 2;

    const nodes = this.spatial.octree.raycast(raycaster);
    const candidateObjects = [];
    for (let node of nodes) {
      const { data: entity } = node;
      if (entity) {
        const object3d = entity.get(Object3DRef).value;

        // Gather all children, because intersectionFinder needs meshes, not
        // just top-level Object3D container
        object3d.traverse((obj) => {
          candidateObjects.push(obj);
        });
      }
    }

    return this.intersectionFinder.find(candidateObjects);
  }

  hideOffCameraObjects() {
    const frustum = this.getFrustum({ grow: SPATIAL_INDEX_THRESHOLD / 2 });
    this.visibleCandidates.clear();

    // Make off-camera things invisible
    if (this.spatial) {
      // Optimization: since we don't *have* to set off-screen entities to
      // invisible, rotate through a few of them each frame; Basically, a
      // rotating cache invalidation
      const entities = Array.from(this.world.entities.entities.values());
      for (let i = 0; i < 100; i++) {
        const entity = entities[(this.frame * 100 + i) % entities.length];
        const object3d = entity.get(Object3DRef)?.value;
        if (object3d) object3d.visible = false;
      }

      // Only turn objects within camera frustum back to 'visible' state
      for (let entity of this.spatial.entitiesInView(frustum)) {
        const object3d = entity.get(Object3DRef)?.value;
        if (object3d) {
          object3d.visible = true;
          this.visibleCandidates.add(object3d);
        }
      }
    }
  }

  getFrustum({ scale = 1.0, grow = 0 } = {}) {
    const frustum = new Frustum();

    const m4 = new Matrix4()
      .copy(this.camera.projectionMatrix)
      .multiplyScalar(scale);
    this.camera.updateProjectionMatrix();
    frustum.setFromProjectionMatrix(
      m4.multiply(this.camera.matrixWorldInverse)
    );
    if (grow) {
      frustum.planes.forEach((plane) => {
        plane.constant += grow;
      });
    }

    return frustum;
  }
}
