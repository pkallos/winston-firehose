# [Winston Firehose](https://www.philkallos.com/winston-firehose/)

NodeJS module, winston logging transport which writes to AWS Firehose.

## Installation
[![NPM](https://nodei.co/npm/winston-firehose.png)](https://npmjs.org/package/winston-firehose)
```bash
npm install winston-firehose
```

## Usage

You can add this logger transport with the following code:

```javascript
const winston = require('winston');
const FirehoseTransport = require('winston-firehose');

// register the transport
const logger = winston.createLogger({
    transports: [
      new FirehoseTransport({
        'streamName': 'firehose_stream_name',
        'firehoseOptions': {
          'region': 'us-east-1'
        }
      })
    ]
  });

// log away!!
// with just a string
logger.info('This is the log message!');

// or with meta info
logger.info('This is the log message!', { snakes: 'delicious' });
```

This will write messages as strings (using JSON.stringify) into Firehose in the following format:
```
{
  timestamp: "2016-05-20T22:48:01.106Z",
  level: "info",
  message: "This is the log message!",
  snakes: "delicious"
};
```

## Options

`streamName (string) - required` The name of the Firehose stream to write to.

`firehoseOptions (object) - optional/suggested` The Firehose options that are passed directly to the constructor,
 [documented by AWS here](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Firehose.html#constructor-property)

 `useLoggerLevel (boolean) - optional` Use winston logger level if set to true. Transport level will default to `info` if undefined.

 `useLoggerFormat (boolean) - optional` Use winston logger format if set to true. Transport format will default to `JSON.stringify` if undefined.

## Details

At the moment this logger sends (unacknowledged!) log messages into firehose. The behavior if the log
message fails to write to Firehose is to emit an 'error' event.
