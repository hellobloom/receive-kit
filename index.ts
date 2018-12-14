import express from "express";
import * as dotenv from "dotenv";
dotenv.config();
import { ResponseData, util as shareKitUtil } from "@bloomprotocol/share-kit";
import { HashingLogic } from "@bloomprotocol/attestations-lib";
import { toBuffer } from "@bloomprotocol/share-kit/dist/src/util";
import { keccak256 } from "js-sha3";
import * as _ from "lodash";

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
      message: "TODO"
    });
  }

  if (isNullOrWhiteSpace(req.body.subject)) {
    errors.push({
      key: "subject",
      message: "TODO"
    });
  }

  if (!(req.body.data instanceof Array) || !req.body.data.length) {
    errors.push({
      key: "data",
      message: "TODO"
    });
  }

  if (isNullOrWhiteSpace(req.body.packedData)) {
    errors.push({
      key: "packedData",
      message: "TODO"
    });
  }

  if (isNullOrWhiteSpace(req.body.signature)) {
    errors.push({
      key: "signature",
      message: "TODO"
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
      message: "TODO"
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
  if (recoveredPackedData !== shareKitResData.packedData) {
    errors.push({
      key: "packedData",
      message: "TODO"
    });
  }

  return errors;
};

const app = express();
const port = process.env.PORT;
if (!port) {
  throw Error("Missing required PORT environment variable");
}

app.listen(port, () => console.log(`Express server running on port ${port}`));
app.use(express.json());

app.post("/api/receive", (req: express.Request, res: express.Response) => {
  // Ensure the structure of the JSON is formatted properly
  const reqFormatValidation = validateRequestFormat(req);
  if (reqFormatValidation.length) {
    return res.status(400).json({ errors: reqFormatValidation });
  }

  const shareKitResData: ResponseData = sortObject(req.body);
  shareKitResData.data = shareKitResData.data.map(d => sortObject(d));

  // Validate the integrity of basic off-chain properties (subject, packedData)
  const basicOffChainValidation = validateBasicOffChainProperties(
    shareKitResData
  );
  if (basicOffChainValidation.length) {
    return res.status(400).json({
      errors: basicOffChainValidation
    });
  }

  // Verify the off-chain data integrity of each data node
  const offChainVerifications = shareKitResData.data.map(d => ({
    layer2Hash: d.layer2Hash,
    errors: shareKitUtil.verifyOffChainDataIntegrity(d)
  }));
  const hasOffChainVerificationErrors = !offChainVerifications.every(
    v => v.errors.length === 0
  );
  if (hasOffChainVerificationErrors) {
    return res.status(400).json({
      errors: offChainVerifications
    });
  }

  return res.status(200).json({
    success: true,
    token: req.body.token
  });
});
