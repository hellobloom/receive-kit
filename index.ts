import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import { ResponseData, util as shareKitUtil } from "@bloomprotocol/share-kit";
import { IVerifiedData } from "@bloomprotocol/share-kit/dist/src/types";
import { TDecodedLog, getDecodedTxEventLogs } from "./txUtils";
import { sortObject } from "./utils";
import {
  validateRequestFormat,
  validateBasicOffChainProperties,
  validateOnChainProperties
} from "./validation";

const app = express();
const port = process.env.PORT;
if (!port) {
  throw Error("Missing required PORT environment variable");
}
const provider = process.env.WEB3_PROVIDER;
if (!provider) {
  throw Error("Missing required WEB3_PROVIDER environment variable");
}

app.listen(port, () => console.log(`Express server running on port ${port}`));
app.use(express.json());

app.post(
  "/api/receive",
  async (req: express.Request, res: express.Response) => {
    // Ensure the structure of the JSON is formatted properly
    const reqFormatValidation = validateRequestFormat(req);
    if (reqFormatValidation.length) {
      console.log(
        `reqFormatValidation: ${JSON.stringify(reqFormatValidation)}`
      );
      return res.status(400).json({ errors: reqFormatValidation });
    }

    const shareKitResData: ResponseData = sortObject(req.body);
    shareKitResData.data = shareKitResData.data.map(d => sortObject(d));

    // Validate the integrity of basic off-chain properties (subject, packedData)
    const basicOffChainValidation = validateBasicOffChainProperties(
      shareKitResData
    );
    if (basicOffChainValidation.length) {
      console.log(
        `basicOffChainValidation: ${JSON.stringify(basicOffChainValidation)}`
      );
      return res.status(400).json({
        errors: basicOffChainValidation
      });
    }

    // Verify the off-chain data integrity of each data node
    const offChainValidation = shareKitResData.data.map(d => ({
      layer2Hash: d.layer2Hash,
      errors: shareKitUtil.verifyOffChainDataIntegrity(d)
    }));
    const hasOffChainVerificationErrors = !offChainValidation.every(
      v => v.errors.length === 0
    );
    if (hasOffChainVerificationErrors) {
      console.log(
        `offChainVerifications: ${JSON.stringify(offChainValidation)}`
      );
      return res.status(400).json({
        errors: offChainValidation
      });
    }

    // Verify the on-chain data integrity
    const decodedDataAndLogs: {
      shareData: IVerifiedData;
      logs: TDecodedLog[];
    }[] = [];
    await Promise.all(
      shareKitResData.data.map(async shareData => {
        decodedDataAndLogs.push({
          shareData,
          logs: await getDecodedTxEventLogs(provider, shareData.tx)
        });
      })
    );
    const onChainValidation = validateOnChainProperties(
      shareKitResData.subject,
      decodedDataAndLogs
    );
    if (onChainValidation.length) {
      console.log(`onChainVerifications: ${JSON.stringify(onChainValidation)}`);
      return res.status(400).json({
        errors: onChainValidation
      });
    }

    return res.status(200).json({
      success: true,
      token: req.body.token
    });
  }
);
