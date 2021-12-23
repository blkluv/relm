import path from "path";
import express from "express";
import fileupload from "express-fileupload";
import cors from "cors";
import sharp from "sharp";

import * as middleware from "../middleware";
import * as conversion from "../conversion";
import { fail, wrapAsync } from "../utils";

export const asset = express.Router();

import {
  TMP_DIR,
  ASSETS_DIR,
  MAX_FILE_EXTENSION_LENGTH,
  MAX_FILE_SIZE,
} from "../config";

// Allow files to be uploaded.
// NOTE: This must be before app.post('/asset')
asset.use(
  fileupload({
    useTempFiles: true,
    tempFileDir: TMP_DIR,
  }) as any
);

asset.get(
  "/query",
  cors(),
  // middleware.authenticated(),
  wrapAsync(async (req, res) => {
    const asset = req.files["files[]"];
  })
);

// Serve uploaded files
asset.use(
  express.static(ASSETS_DIR, {
    setHeaders: (res, path, stat) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    },
  })
);

// Upload images and 3D assets
asset.post(
  "/",
  cors(),
  // middleware.authenticated(),
  // middleware.authorized("edit"),
  wrapAsync(async (req, res) => {
    if (!('file' in req.files)) {
      return fail(res, "expecting file form-data")
    }

    // TODO: turn on `batch: true` and change this to one-or-many
    //   - attribute would change from "file" to "files[]"
    //   - asset becomes single asset in case of 1 file uploaded
    //   - assets become array of assets in case of 2+ files
    //   - ?? how do we respond to Uppy for errors in just 1 of several?
    const asset = req.files["file"];
    if (asset.size > MAX_FILE_SIZE) {
      return fail(res, "file too large");
    }

    const extension = path.extname(asset.name).toLowerCase();
    if (extension.length > MAX_FILE_EXTENSION_LENGTH) {
      return fail(res, "file extension too long");
    }

    try {
      switch (extension) {
        case ".jpg":
        case ".jpeg":
        case ".gif":
        case ".png":
        case ".webp":
          const pngTempFile = asset.tempFilePath + ".png";
          await sharp(asset.tempFilePath).toFile(asset.tempFilePath + ".png");
          const png = await conversion.moveOrUploadContentAddressable(
            pngTempFile
          );

          const webpTempFile = asset.tempFilePath + ".webp";
          await sharp(asset.tempFilePath).toFile(asset.tempFilePath + ".webp");
          const webp = await conversion.moveOrUploadContentAddressable(
            webpTempFile
          );

          return conversion.fileUploadSuccess(res, { png, webp });

        case ".glb":
        case ".packed-glb":
        case ".gltf":
        case ".packed-gltf":
          const gltf = await conversion.moveOrUploadContentAddressable(
            asset.tempFilePath,
            extension
          );
          return conversion.fileUploadSuccess(res, { gltf });

        default:
          return fail(res, "unsupported filetype");
      }
    } catch (err) {
      return fail(res, err);
    }
  })
);
