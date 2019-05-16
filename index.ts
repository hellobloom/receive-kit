import * as dotenv from 'dotenv'
dotenv.config()
import express, { ErrorRequestHandler } from 'express'
import { validateUntypedResponseData } from '@bloomprotocol/share-kit'

const app = express()
const port = process.env.PORT
if (!port) {
  throw Error('Missing required PORT environment variable')
}
const validateOnChain =
  typeof process.env.VALIDATE_ON_CHAIN === 'string' &&
  process.env.VALIDATE_ON_CHAIN.toLowerCase() === 'true'
const web3Provider = process.env.WEB3_PROVIDER
if (validateOnChain && !web3Provider) {
  throw Error('Missing required WEB3_PROVIDER environment variable')
}
app.use(express.json())

app.post(
  '/api/receive',
  async (req: express.Request, res: express.Response) => {
    try {
      const verifiedData = await validateUntypedResponseData(req.body, {
        validateOnChain,
        web3Provider
      })
      if (verifiedData.kind === 'invalid') {
        return res.status(400).json({ errors: verifiedData.errors })
      }
      return res.status(200).json({
        success: true,
        token: req.body.token
      })
    } catch (err) {
      console.log('/api/receive catch', err)
      return res.status(500).json({
        error:
          err && err.message ? err.message : 'An unexpected error has occurred.'
      })
    }
  }
)

const catchallErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }
  return res.status(500).json({
    error:
      err && err.message ? err.message : 'An unexpected error has occurred.'
  })
}
app.use(catchallErrorHandler)

process.on('unhandledRejection', error => {
  if (error) {
    console.log('unhandledRejection', error)
  }
})

app.listen(port, () => console.log(`Express server running on port ${port}`))
