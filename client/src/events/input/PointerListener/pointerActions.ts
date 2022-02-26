import { Object3D, Vector2, Vector3 } from "three";
import { get } from "svelte/store";

import { hasAncestor } from "~/utils/hasAncestor";
import { globalEvents } from "~/events";
import { pointerPointInSelection } from "./selectionLogic";
import * as selectionLogic from "./selectionLogic";

import {
  addTouchController,
  removeTouchController,
} from "~/ecs/plugins/player-control";
import { Object3DRef } from "~/ecs/plugins/core";
import { WorldPlanes } from "~/ecs/shared/WorldPlanes";
import { Clickable, Clicked } from "~/ecs/plugins/clickable";

import { worldManager } from "~/world";
import { worldUIMode } from "~/stores/worldUIMode";
import { mouse } from "~/stores/mouse";

import { DRAG_DISTANCE_THRESHOLD } from "~/config/constants";
import { DragPlane } from "./DragPlane";
import { SelectionBox } from "./SelectionBox";

export let isControllingAvatar: boolean = false;

const pointerPosition = new Vector2();
const pointerStartPosition = new Vector2();
const cameraPanOffset = new Vector3();

type PointerState = "initial" | "click" | "drag" | "drag-select";

let pointerState: PointerState = "initial";
let pointerDownFound: string[] = [];
let dragOffset: Vector3 = new Vector3();
let pointerPoint: Vector3;
let shiftKeyOnClick = false;

let dragPlane;
let selectionBox;

// TODO: Make selectionBox and dragPlane aspects of World?
function getDragPlane() {
  if (!dragPlane) {
    dragPlane = new DragPlane(worldManager.world);
  }
  return dragPlane;
}

function getSelectionBox() {
  if (!selectionBox) {
    selectionBox = new SelectionBox(worldManager.world);
  }
  return selectionBox;
}

function setNextPointerState(nextState: PointerState) {
  if (nextState === "drag" || nextState === "drag-select") {
    document.body.classList.add("pointer-events-none");
  } else {
    document.body.classList.remove("pointer-events-none");
  }
  pointerState = nextState;
}

export function onPointerDown(x: number, y: number, shiftKey: boolean) {
  const world = worldManager.world;
  const finder = world.presentation.intersectionFinder;

  pointerPosition.set(x, y);
  pointerStartPosition.set(x, y);

  pointerDownFound = finder.entityIdsAt(pointerPosition);

  if (get(worldUIMode) === "build") {
    // At this point, at least a 'click' has started. TBD if it's a drag.
    setNextPointerState("click");
    shiftKeyOnClick = shiftKey;

    selectionLogic.mousedown(pointerDownFound, shiftKey);
    pointerPoint = pointerPointInSelection(
      worldManager.selection,
      pointerDownFound
    );
    if (pointerPoint) getDragPlane().setOrigin(pointerPoint);
  } else if (get(worldUIMode) === "play") {
    if (
      pointerDownFound.includes(worldManager.avatar.entities.body.id as string)
    ) {
      addTouchController(worldManager.avatar.entities.body);
      isControllingAvatar = true;
    } else {
      // At this point, at least a 'click' has started. TBD if it's a drag.
      setNextPointerState("click");
      getDragPlane().setOrientation("xz");
      if (pointerDownFound.length > 0) {
        const position = clickedPosition(pointerDownFound[0], world);
        getDragPlane().setOrigin(position);
      } else {
        const planes: WorldPlanes =
          worldManager.world.perspective.getAvatarPlanes();
        const position = new Vector3();
        planes.getWorldFromScreen(pointerPosition, position);
        getDragPlane().setOrigin(position);
      }
    }
  }
}

export function onPointerUp(event: MouseEvent | TouchEvent) {
  if (get(worldUIMode) === "build") {
    if (pointerState === "click") {
      selectionLogic.mouseup(worldManager.selection);
    } else if (pointerState === "drag") {
      worldManager.selection.syncEntities();
    }
  } else if (get(worldUIMode) === "play") {
    if (pointerState === "click" && pointerDownFound.length > 0) {
      const entities = worldManager.world.entities;
      pointerDownFound.forEach((entityId) => {
        const entity = entities.getById(entityId);
        if (entity.has(Clickable)) {
          entity.add(Clicked);
        }
      });
    } else {
      removeTouchController(worldManager.avatar.entities.body);
      isControllingAvatar = false;
    }
  }

  // dragPlane.hide();
  getSelectionBox().hide();

  // reset mouse mode
  setNextPointerState("initial");
}

export function onPointerMove(x: number, y: number, shiftKeyOnMove: boolean) {
  const world = worldManager.world;
  const finder = world.presentation.intersectionFinder;

  pointerPosition.set(x, y);

  globalEvents.emit("mouseActivity");

  finder.entityIdsAt(pointerPosition);

  mouse.set(finder._normalizedCoord);

  if (get(worldUIMode) === "build") {
    if (
      pointerState === "click" &&
      pointerPosition.distanceTo(pointerStartPosition) >=
        DRAG_DISTANCE_THRESHOLD
    ) {
      // drag  mode start
      if (worldManager.selection.length > 0 && pointerPoint) {
        setNextPointerState("drag");
        worldManager.selection.savePositions();
        getDragPlane().setOrientation(shiftKeyOnClick ? "xy" : "xz");
      } else {
        setNextPointerState("drag-select");
        getSelectionBox().show();
        getSelectionBox().setStart(pointerStartPosition);
        getSelectionBox().setEnd(pointerStartPosition);
      }
    } else if (pointerState === "drag") {
      // drag mode
      const delta = getDragPlane().getDelta(pointerPosition);
      worldManager.selection.moveRelativeToSavedPositions(delta);
    } else if (pointerState === "drag-select") {
      if (shiftKeyOnMove) {
        getSelectionBox().setTop(pointerPosition);
      } else {
        getSelectionBox().setEnd(pointerPosition);
      }

      const contained = getSelectionBox().getContainedEntityIds();

      worldManager.selection.clear(true);
      worldManager.selection.addEntityIds(contained);
    }
  } else if (get(worldUIMode) === "play") {
    if (
      pointerState === "click" &&
      pointerPosition.distanceTo(pointerStartPosition) >=
        DRAG_DISTANCE_THRESHOLD
    ) {
      // drag  mode start
      setNextPointerState("drag");
      cameraPanOffset.copy(worldManager.camera.pan);
    } else if (pointerState === "drag") {
      const delta = getDragPlane().getDelta(pointerPosition);
      dragOffset.copy(delta).sub(cameraPanOffset);
      worldManager.camera.setPan(-dragOffset.x, -dragOffset.z);
    }
  }
}

function clickedPosition(entityId, world) {
  const entity = world.entities.getById(entityId);
  const object3d: Object3D = entity?.get(Object3DRef)?.value;
  return object3d?.userData.lastIntersectionPoint;
}
