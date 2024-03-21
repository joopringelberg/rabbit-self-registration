// BEGIN LICENSE
// Perspectives Distributed Runtime
// SPDX-FileCopyrightText: 2019 Joop Ringelberg (joopringelberg@perspect.it), Cor Baars
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//
// Full text of this license can be found in the LICENSE directory in the projects root.

// END LICENSE

const express = require("express");
const fs = require("fs/promises");
const http = require('http');

////////////////////////////////////////////////////////////////////////////////
// Use the commander package to read command line arguments.
const { Command } = require('commander');
const program = new Command();
program
  .name('rabbit-self-registration')
  .description('A simple self-registration service for RabbitMQ users.')
  .version('0.0.0')
  .option('-s, --serviceport <port>', 'The port number of the server.')
  .option('-r, --rabbitport <port>', 'The port number of the RabbitMQ server.')
  // provide help on the command line.
  .on('--help', () => { console.log('  Example usage:'); console.log('    $ node src/index.js -s 5988 -r 5672'); })
  .parse(process.argv);

program.parse();

////////////////////////////////////////////////////////////////////////////////
let serviceData = 
  { adminUserName: ""
  , adminPassword: ""
  , maxUsers: 10
  , numberOfAccountsProvided: 0
  , userIds: []
  };

// Inspired on https://blog.logrocket.com/reading-writing-json-files-node-js-complete-tutorial/
function saveServiceData()
{
  return fs.writeFile("./rabbit-self-registration.json", JSON.stringify(serviceData), "utf8")
    .then( () => console.log("Service data saved."))
    .catch( error => console.log(error));
}

// Returns a promise for JSON data conform the serviceData structure.
function readServiceData()
{
  return fs.readFile("./rabbit-self-registration.json")
    .then( data => serviceData = JSON.parse(data))
}

////////////////////////////////////////////////////////////////////////////////
let PORT, RABBITPORT;

// Set the port number for the server.
PORT = program.opts().serviceport || 5988;
RABBITPORT = program.opts().rabbitport || 5672;

const app = express ();
app.use(express.json());

// Read the service data from the file.
readServiceData().then( () => 
  // Start the server.
  app.listen(PORT, () => {
    console.log("Server Listening on PORT:", PORT);
  }))
  .catch( error => console.log( "Could not start the service: no data file found. " + error) );

// Service endpoints:
app.get("/getmaxnumberofusers", (request, response) => {  
  response.send(serviceData.maxUsers.toString());
});

app.get("/getremainingnumberofaccounts", (request, response) => {  
  response.send((serviceData.maxUsers - serviceData.numberOfAccountsProvided).toString());
});

app.post("/setmaxnumberofusers", (request, response) => {
  serviceData.maxUsers = request.body.maxusers;
  saveServiceData().then( () => response.send("true") )
    .catch( error => {
      console.log(error);
      response.send("false")
    });
})

app.post("/selfregister", (request, response) => {
  const { userName, password, queueName } = request.body;
  if (serviceData.userIds.find(id => id == userName))
  {
    response.send("false");
  }
  else
  {
    if (serviceData.adminPassword && serviceData.adminUserName)
    {
      // Make an http call to the RabbitMQ server to create the user.
      createUser(userName, password)
        .then( () => setPermissions(userName, queueName) )
        .then( () => {
          serviceData.userIds.push( user.id );
          serviceData.numberOfAccountsProvided = serviceData.numberOfAccountsProvided + 1;
          saveServiceData()
        })
        .then( () => response.send("true") )
        .catch( error => {
          console.log(error);
          response.send("false")
        });
  }
}});

app.post("/setadmincredentials", (request, response) => {
  const {adminUserName, adminPassword} = request.body;
  if (adminUserName && adminPassword)
  {
    serviceData.adminUserName = adminUserName;
    serviceData.adminPassword = adminPassword; 
    saveServiceData()
      .then( () => response.send("true") )
      .catch( error => {
        console.log(error);
        response.send("false")
      });
  }
  else
  {
    response.send("false");
  }
})

////////////////////////////////////////////////////////////////////////////////
// Returns a promise for true when the call to the rapperMQ server was successful.
function createUser(userName, password)
{
  // Create a promise for the http call.
  return new Promise( (resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: RABBITPORT,
      path: '/api/users/' + userName,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(serviceData.adminUserName + ':' + serviceData.adminPassword).toString('base64')
      },
      content: JSON.stringify( { password: password, tags: "" } )
    };
    const req = http.request(options, res => {
      resolve(true);
      console.log(`statusCode: ${res.statusCode}`);
      res.on('data', d => {
        process.stdout.write(d);
      });
    });
    req.on('error', error => {
      console.error(error);
      reject(error);
    });
    req.end();
  });
}

// Returns a promise for true when the call to the rapperMQ server was successful.
function setPermissions(userName, queueName)
{
  // Create a promise for the http call.
  return new Promise( (resolve, reject) => {
    // Make an http call to the RabbitMQ server to set the permissions.
    const options = {
      hostname: 'localhost',
      port: RABBITPORT,
      path: '/api/permissions/inplace/' + userName,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(serviceData.adminUserName + ':' + serviceData.adminPassword).toString('base64')
      },
      content: JSON.stringify( { configure: queueName, write: queueName + "|amq\\.topic", read: queueName + "|amq\\.topic" } )
    };
    const req = http.request(options, res => {
      resolve(true);
      console.log(`statusCode: ${res.statusCode}`);
      res.on('data', d => {
        process.stdout.write(d);
      })});
    req.on('error', error => {
      console.error(error);
      reject(error);
    });
    req.end();
  });
}