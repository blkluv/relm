import * as express from "express";
import cors from "cors";

import * as util from "../utils";
import * as middleware from "../middleware";
import { Invitation, Permission } from "../db";

const { wrapAsync } = util;

export const invite = express.Router();

// Create an invitation to a relm
invite.post(
  "/make",
  cors(),
  middleware.relmExists(),
  middleware.authenticated(),
  middleware.authorized("invite"),
  wrapAsync(async (req, res) => {
    const attrs: any = {
      relmId: req.relm.relmId,
      createdBy: req.authenticatedPlayerId,
      permits: ["access"],
    };

    if (req.body) {
      if ("token" in req.body) {
        attrs.token = req.body.token;
      }
      if ("maxUses" in req.body) {
        attrs.maxUses = req.body.maxUses;
      }
      if ("permits" in req.body) {
        attrs.permits = [...Permission.filteredPermits(req.body.permits)];
      }
    }

    let invitation;
    try {
      invitation = await Invitation.createInvitation(attrs);
    } catch (err) {
      if (err.message.match(/duplicate key/)) {
        invitation = await Invitation.updateInvitation(attrs);
      } else {
        throw err;
      }
    }

    util.respond(res, 200, {
      status: "success",
      action: "create",
      invitation: Invitation.toJSON(invitation),
    });
  })
);

// Get all invitations for this relm that match the query
invite.get(
  "/query",
  cors(),
  middleware.relmExists(),
  middleware.authenticated(),
  middleware.authorized("invite"),
  wrapAsync(async (req, res) => {
    const token = req.query["token"];
    const relmId = req.relm.relmId;

    const invitations = await Invitation.getInvitations({ relmId, token });

    util.respond(res, 200, {
      status: "success",
      invitations: invitations.map((invite) => Invitation.toJSON(invite)),
    });
  })
);

invite.delete(
  "/delete",
  cors(),
  middleware.relmExists(),
  middleware.authenticated(),
  middleware.authorized("invite"),
  wrapAsync(async (req, res) => {
    const attrs: any = {
      relmId: req.relm.relmId,
      token: req.body.token,
    };

    const invitations = await Invitation.deleteInvitation(attrs);

    util.respond(res, 200, {
      status: "success",
      action: "delete",
      deletedCount: invitations.length,
    });
  })
);