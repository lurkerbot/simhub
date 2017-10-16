'use strict'

var color = require('cli-color')
var cli = require('commander')
var net = require('net')
var _ = require('lodash')
var AWS = require('aws-sdk')
var json2csv = require('json2csv')
const uuid = require('uuid/v4')

var totalRecordCount = 0
var intervalRecordCount = 0
var firstRecord = true

const collectorId = uuid()
const runId = uuid()
var runCounter = 0
var runDataCount = 0

AWS.config = {
  region: 'us-east-1'
// other service API versions
}

var kinesis = new AWS.Firehose()
var kinesisPartition = 0
const partitionCount = 3

function getPartition () {
  if (kinesisPartition < partitionCount)
    return kinesisPartition.toString()

  kinesisPartition++
}

cli.version('1.0.0')
  .usage('[options]')
  .option('-h, --host <name or IP>', 'IP or name of the server', 'localhost')
  .option('-p, --port <port>', 'TCP Port', '8080')
  .option('-s, --streamName <name>', 'Kinesis stream name', 'simTrain')
  .option('-f, --format [csv,json]' , 'Output type (csv or json)', 'csv')
  .option('-k, --kinesis [true, false]' , 'Send to kinesis', true)
  .parse(process.argv)

console.log(color.green(`Starting training data collection for ${cli.host} port ${cli.port}`))
console.log(color.green(`collector id ${collectorId}`))

var dataStream = net.createConnection(cli.port, cli.host)

dataStream
  .on('error', function (error) {
    console.log(color.red(`${error}`))
  })
  .on('connect', function () {
    console.log(color.green(`Connected to ${cli.host}:${cli.port}`))

    setInterval(function (a) {
      console.log(color.yellow(`Processing: ${intervalRecordCount}/${totalRecordCount}`))
      intervalRecordCount = 0
    }, 5000)
  })
  .on('data', function (data) {
    if (firstRecord)
      console.log(color.yellow(`Receiving data`))

    var jsonData = JSON.parse(data.toString())
    jsonData['data']['collectorId'] = collectorId
    jsonData['data']['runId'] = `${runId}_${runCounter}`

    if (jsonData.data.success) {
      console.log(color.yellow(`run ${runCounter}/${runDataCount} rows`))

      runCounter++
      runDataCount = 0
      console.log(color.yellow(` - New run: ${runCounter}`))
    }

    if (cli.kinesis) {
      var output = ''
      if (cli.format == 'csv')
        output = json2csv({ data: jsonData.data, hasCSVColumnTitle: false,flatten: true })
      else
        output = JSON.stringify(jsonData)

      console.log(output)
      var params = {
        Record: {
          Data: output
        },
        DeliveryStreamName: cli.streamName
      }
      kinesis.putRecord(params, function (err, data) {
        if (err) console.log(err.message) // an error occurred
        else {
          console.log(color.green(`written to kinesis ${data.RecordId}`))
        }
      })
    }

    totalRecordCount++
    runDataCount++
    intervalRecordCount++
    firstRecord = false
  })
