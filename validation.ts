import express = require("express");
import { ResponseData } from "@bloomprotocol/share-kit";
import { isNullOrWhiteSpace } from "./utils";
import { HashingLogic } from "@bloomprotocol/attestations-lib";
import { toBuffer } from "@bloomprotocol/share-kit/dist/src/util";
import { keccak256 } from "js-sha3";
import { IVerifiedData } from "@bloomprotocol/share-kit/dist/src/types";
import { TDecodedLog, getDecodedLogValueByName } from "./txUtils";

type TRequestFormatError = {
  key: keyof ResponseData;
  message: string;
};

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
        getDecodedLogValueByName(l, "dataHash") === dl.shareData.layer2Hash
    );
    if (!matchingTraitAttestedLogs) {
      errors.push({
        key: "TraitAttested",
        message:
          "Unable to find 'TraitAttested' event logs with a" +
          ` 'dataHash' of '${dl.shareData.layer2Hash}'.`
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

export {
  validateRequestFormat,
  validateBasicOffChainProperties,
  validateOnChainProperties
};
