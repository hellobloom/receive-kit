import express from "express";
import { HashingLogic } from "@bloomprotocol/attestations-lib";
import { ResponseData, util as shareKitUtil } from "@bloomprotocol/share-kit";
import { toBuffer } from "@bloomprotocol/share-kit/dist/src/util";
import { IVerifiedData } from "@bloomprotocol/share-kit/dist/src/types";
import { keccak256 } from "js-sha3";
import _ from "lodash";
import {
  TDecodedLog,
  getDecodedTxEventLogs,
  getDecodedLogValueByName
} from "./txUtils";

import * as dotenv from "dotenv";
dotenv.config();

// Implementation from http://whitfin.io/sorting-object-recursively-node-jsjavascript/
function sortObject<T>(object: any): T {
  let sortedObj: any = {};
  let keys = _.keys(object);
  keys = _.sortBy(keys, (key: string) => {
    return key;
  });

  _.each(keys, (key: string) => {
    if (typeof object[key] === "object" && !(object[key] instanceof Array)) {
      sortedObj[key] = sortObject(object[key]);
    } else {
      sortedObj[key] = object[key];
    }
  });

  return sortedObj as T;
}

type TRequestFormatError = {
  key: keyof ResponseData;
  message: string;
};

const isNullOrWhiteSpace = (value: any): boolean =>
  typeof value !== "string" || value.trim() === "";

const validateRequestFormat = (req: express.Request): TRequestFormatError[] => {
  const errors: TRequestFormatError[] = [];

  if (isNullOrWhiteSpace(req.body.token)) {
    errors.push({
      key: "token",
      message:
        "Request body requires a non-whitespace 'token' property of type string."
    });
  }

  if (isNullOrWhiteSpace(req.body.subject)) {
    errors.push({
      key: "subject",
      message:
        "Request body requires a non-whitespace 'subject' property of type string."
    });
  }

  if (!(req.body.data instanceof Array) || !req.body.data.length) {
    errors.push({
      key: "data",
      message:
        "Request body requires a non-empty 'data' property of type Array."
    });
  }

  if (isNullOrWhiteSpace(req.body.packedData)) {
    errors.push({
      key: "packedData",
      message:
        "Request body requires a non-whitespace 'packedData' property of type string."
    });
  }

  if (isNullOrWhiteSpace(req.body.signature)) {
    errors.push({
      key: "signature",
      message:
        "Request body requires a non-whitespace 'signature' property of type string."
    });
  }

  return errors;
};

type TBasicOffChainValidationError = {
  key: Extract<keyof ResponseData, "subject" | "packedData">;
  message: string;
};

const validateBasicOffChainProperties = (shareKitResData: ResponseData) => {
  const errors: TBasicOffChainValidationError[] = [];

  const signerEthAddress = HashingLogic.recoverHashSigner(
    toBuffer(shareKitResData.packedData),
    shareKitResData.signature
  );
  if (shareKitResData.subject !== signerEthAddress) {
    errors.push({
      key: "subject",
      message:
        "The recovered subject address based on the 'packedData' and 'signature'" +
        " does not match the one that was shared." +
        `\nShared subject address: '${shareKitResData.subject}'` +
        `\nRecovered subject address: '${signerEthAddress}'`
    });
  }

  const recoveredPackedData =
    "0x" +
    keccak256(
      JSON.stringify({
        data: shareKitResData.data,
        token: shareKitResData.token
      })
    );
  if (shareKitResData.packedData !== recoveredPackedData) {
    errors.push({
      key: "packedData",
      message:
        "The recovered packed data hash computed by running 'keccak256' on an object" +
        " containing the shared 'data' and 'token' does not match the 'packedData'" +
        " that was shared." +
        `\nShared packed data: '${shareKitResData.packedData}'` +
        `\nRecovered packed data: '${recoveredPackedData}'`
    });
  }

  return errors;
};

type TDecodedLogsAndData = {
  shareData: IVerifiedData;
  logs: TDecodedLog[];
};
type TOnChainValidationError = {
  key: "TraitAttested" | "subject" | "attester" | "layer2Hash";
  message: string;
};

const validateOnChainProperties = (
  subject: string,
  decodedLogsAndData: TDecodedLogsAndData[]
) => {
  const errors: TOnChainValidationError[] = [];

  decodedLogsAndData.forEach(dl => {
    // verify subject shared dataHash matches chain by using it as a part of the find logic
    const matchingTraitAttestedLogs = dl.logs.find(
      l =>
        l.name === "TraitAttested" &&
        getDecodedLogValueByName(l, "layer2Hash") === dl.shareData.layer2Hash
    );
    if (!matchingTraitAttestedLogs) {
      errors.push({
        key: "TraitAttested",
        message:
          "Unable to find 'TraitAttested' event logs with a" +
          ` 'layer2Hash' of '${dl.shareData.layer2Hash}'.`
      });
      return;
    }

    // verify shared subject address matches chain
    const onChainSubjectAddress = getDecodedLogValueByName(
      matchingTraitAttestedLogs,
      "subject"
    );
    if (subject !== onChainSubjectAddress) {
      errors.push({
        key: "subject",
        message:
          "The on chain subject address does not match what was shared." +
          `\nShared subject address: '${subject}'` +
          `\nOn chain subject address: '${onChainSubjectAddress}'`
      });
    }

    // verify shared attester address matches chain
    const onChainAttesterAddress = getDecodedLogValueByName(
      matchingTraitAttestedLogs,
      "attester"
    );
    if (dl.shareData.attester !== onChainAttesterAddress) {
      errors.push({
        key: "attester",
        message:
          "The on chain attester address does not match what was shared." +
          `\nShared attester address: '${dl.shareData.attester}'` +
          `\nOn chain attester address: '${onChainAttesterAddress}'`
      });
    }
  });

  return errors;
};

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
