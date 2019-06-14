// You can make a daily export of your database using the following cron jobs (as root)
// To write a binary backup
// 0 0 * * * influxd backup -portable /mnt/my-drive/memoro-backups/full
// To write a backup as a csv file
// 0 0 * * * influx -database 'memoro' -host 'localhost' -execute 'SELECT * FROM "memoro"' -format 'csv' > /mnt/my-drive/memoro-backups/csv/memoro_$(date +\%Y-\%m-\%d).csv

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
// you can set the port to which the server listens as an argument, if none is set defaults to 8080
const port = process.argv[2] || 8080;
const Influx = require('influx');
// --> indicate where your influxDB is located and to which db to write
const influx = new Influx.InfluxDB('http://192.168.0.30:8086/memoro');
const mqtt = require('mqtt');

// If test is set to true, then MQTT messages can be sent for testing without them being written into the DB.
var test = true;

// MQTT client --> change to IP address of server
var mqtt_client = mqtt.connect('mqtt://192.168.0.30');

mqtt_client.on('connect', function() {
    console.log('MQTT client has subscribed successfully to broker');
    mqtt_client.subscribe('#');
});


mqtt_client.on('message', function(topic, message) {
    console.log(topic + " " + message.toString()); //if toString is not given, the message comes as buffer
    time = Math.round(Date.now() / 1000);
    // The message can be a JSON object which you can parse into individual variables
    // if (message.length) {
    //   message = JSON.parse(message.toString());   

    // }


    if (!test) {
        console.log("write to db");
        // --> this has to be adapted to the type of data you intend to write
        // there have to be at least one tag and a value per datapoint.
        influx.writePoints([{
                measurement: 'memoro',
                tags: { topic: topic },
                fields: { value: message.toString() },
                timestamp: time,
            }], {
                database: 'memoro',
                precision: 's', // the precision of the timestamp
            })
            .catch(error => {
                console.error(`Error saving data to InfluxDB! ${error.stack}`)
            });
    }
});


// create a default server that serves different types of files and responds to
// POST requests to save edited data
http.createServer(function(req, res) {
    console.log(`${req.method} ${req.url}`);

    // this is example code for pages which send back data via AJAX
    if (req.method === 'POST') {
        if (req.url.includes("nameOfAnAJAXPage")) {
            // call the function that parses the data (which has to be sent as JSON)
            collectRequestData(req, data => {

                // do something the received data
                res.end();

            });
        }
    } else {
        // A page or a file was requested. Figure out which one and serve it
        // or give an error message if the page doens't exist.
        // parse URL
        var parsedUrl = url.parse(req.url);
        // extract URL path
        var pathname = `.${parsedUrl.pathname}`;
        // based on the URL path, extract the file extention. e.g. .js, .doc, ...
        var ext = path.parse(pathname).ext;
        // maps file extention to MIME typere
        var query = parsedUrl.query;

        const map = {
            '.ico': 'image/x-icon',
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.json': 'application/json',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.wav': 'audio/wav',
            '.mp3': 'audio/mpeg',
            '.svg': 'image/svg+xml',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword'
        };
        console.log("looking for " + pathname);

        fs.exists(pathname, function(exist) {
            if (!exist) {
                // if the file is not found, return 404
                res.statusCode = 404;
                res.end(`File ${pathname} not found!`);
                return;

            }

            // if is a directory search for index file matching the extension
            if (fs.statSync(pathname).isDirectory()) {
                ext = '.html';
                pathname += '/index' + ext;
            }
            // read file from file system
            fs.readFile(pathname, function(err, data) {
                if (err) {
                    res.statusCode = 500;
                    res.end(`Error getting the file: ${err}.`);
                } else {
                    // the server shows any html page by default without any further 
                    // modification required here. For pages which need data to be shown
                    // a special page response has to be programmed below.
                    // Included is an example for a page called /events which displays the
                    // data from the last 7 days as a table.

                    // page showing the raw event table
                    if (pathname.includes("events")) {
                        console.log("serving the events page");
                        res.setHeader('Content-type', map[ext] || 'text/plain');
                        res.write(data);
                        getDataForWeek(res);
                    } else { // include further else ifs for additional custom pages               
                        // if the file is found, set Content-type and send data
                        res.setHeader('Content-type', map[ext] || 'text/plain');
                        res.end(data);
                    }
                }
            });
        });
    }

}).listen(parseInt(port));

console.log(`Server listening on port ${port}`);





function getDataForWeek(res) {
    influx.query(`
    select * from memoro where time > now() - 7d tz('Europe/Paris')
  `)
        .then(data => {
            if (data) {
                var str = JSON.stringify(data);
                res.write('<script> var data = ' + str + ';</script>\n');
                res.write('<script> document.body.appendChild(drawData(data)); </script>');
            }
            res.end();
        }).catch(error => response.status(500).json({ error }));

}


// function which reads json data sent by a POST request and returns a parsed object
function collectRequestData(request, callback) {


    const FORM_URLENCODED = 'application/json'; //x-www-form-urlencoded';
    if (request.headers['content-type'] === FORM_URLENCODED) {
        var body = '';
        request.on('data', chunk => {
            body += chunk.toString();
        });
        request.on('end', () => {
            callback(JSON.parse(body));
        });
    } else {
        callback(null);
    }
}