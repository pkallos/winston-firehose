[![Build Status](https://travis-ci.org/pkallos/winston-firehose.svg?branch=master)](https://travis-ci.org/pkallos/winston-firehose)

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
var winston = require('winston');
var WFirehose = require('winston-firehose');

// register the transport
var logger = winston.createLogger({
    transports: [
      new WFirehose({
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

This will write messages as strings (using logger or transport's format) into Firehose.
By default `winston.format.json()` will be used:
```
{
  level: "info",
  message: "This is the log message!",
  snakes: "delicious"
};
```

## Options

`streamName (string) - required` The name of the Firehose stream to write to.

`firehoseOptions (object) - optional/suggested` The Firehose options that are passed directly to the constructor,
 [documented by AWS here](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Firehose.html#constructor-property)

## Details

At the moment this logger sends (unacknowledged!) log messages into firehose. Right now the behavior if the log
message fails to write to Firehose is simply to do absolutely nothing and fail silently.
