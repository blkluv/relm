import { worldManager } from "~/world";
import { Participant } from "~/types";
import { playerId } from "~/identity/playerId";

import { setAppearance } from "./appearance";
import { setEmoji } from "./emoji";
import { setLabel } from "./label";
import { setOculus } from "./oculus";
import { setSpeech } from "./speech";

function onDidEditName(name: string) {
  worldManager.participants.setName(name);
}

function onCloseSpeech() {
  worldManager.participants.setCommunicatingState(null, "speaking", false);
}

export function setAvatarFromParticipant(this: void, participant: Participant) {
  if (!participant) return;
  if (!participant.avatar)
    throw Error(`participant requires avatar: ${participant.participantId}`);

  const isLocal = participant.participantId === playerId;

  const entities = participant.avatar.entities;
  const data = participant.identityData;
  setAppearance(entities, data.appearance);
  setEmoji(entities, data.emoji, data.emoting);
  setLabel(
    entities,
    data.name,
    data.color,
    participant.editable && isLocal ? onDidEditName : null
  );
  setOculus(
    entities,
    participant.participantId,
    data.showAudio,
    data.showVideo
  );
  setSpeech(
    entities,
    data.message,
    data.speaking,
    isLocal ? onCloseSpeech : null
  );

  return true;
}
