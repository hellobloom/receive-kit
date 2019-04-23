import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import { validateUntypedResponseData } from "@bloomprotocol/share-kit";

const app = express();
const port = process.env.PORT;
if (!port) {
  throw Error("Missing required PORT environment variable");
}
const validateOnChain =
  typeof process.env.VALIDATE_ON_CHAIN === "string" &&
  process.env.VALIDATE_ON_CHAIN.toLowerCase() === "true";
const web3Provider = process.env.WEB3_PROVIDER;
if (validateOnChain && !web3Provider) {
  throw Error("Missing required WEB3_PROVIDER environment variable");
}

app.listen(port, () => console.log(`Express server running on port ${port}`));
app.use(express.json());

app.post(
  "/api/receive",
  async (req: express.Request, res: express.Response) => {
    const output = await validateUntypedResponseData(req.body, {
      validateOnChain,
      web3Provider
    });
    if (output.errors && output.errors.length > 0) {
      return res.status(400).json({ errors: output.errors });
    }
    return res.status(200).json({
      success: true,
      token: req.body.token
    });
  }
);
