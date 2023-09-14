# Introduction 
Data service micro-service helps TDEI system to persisting & querying the information specific to the OSW.

## Getting Started
The project is built on NodeJS framework. All the regular nuances for a NodeJS project are valid for this.

## System requirements
| Software | Version|
|----|---|
| NodeJS | 16.17.0|
| Typescript | 4.8.2 |

## Environment variables

Application configuration is read from .env file. Below are the list of environemnt variables service is dependent on. An example of environment file is available [here](./env.example) and description of environment variable is presented in below table

|Name| Description |
|--|--|
| PROVIDER | Provider for cloud service or local (optional)|
|QUEUECONNECTION | Queue connection string |
|STORAGECONNECTION | Storage connection string|
|PORT |Port on which application will run|
|VALIDATION_SUBSCRIPTION | Upload topic subscription name|
|VALIDATION_TOPIC | Validation topic name|
|AUTH_PERMISSION_URL | Authentication/Authorization url|
|DATASVC_TOPIC | Data service publishing topic|
|POSTGRES_DB | Database name|
|POSTGRES_HOST| Link to the database host |
|POSTGRES_USER| Database user |
|POSTGRES_PASSWORD| Database user password|
|GATEWAY_URL | Gateway Url|

## Local Postgresql database setup

Step 1: Ensure all the environment variables are setup.

Step 2: Ensure docker is installed on local system. 

Step 3: Run below command which will setup Postgresql database and PgAdmin client console for postgresql database.

```docker compose up```  from root directory

## Build

Follow the steps to install the node packages required for both building and running the application

1. Install the dependencies. Run the following command in terminal on the same directory level as `package.json`
    ```shell
    npm install
    ```
2. To start the server, use the command `npm run start`
3. The http server by default starts with 3000 port or whatever is declared in `process.env.PORT` (look at `index.ts` for more details)
4. Health check available at path `health/ping` with get and post. Make `get` or `post` request to `http://localhost:3000/health/ping`.
Ping should respond with "healthy!" message with HTTP 200 status code.

## Test

Follow the steps to install the node packages required for testing the application

1. Ensure we have installed the dependencies. Run the following command in terminal on the same directory level as `package.json`
    ```shell
    npm install
    ```
2. To start testing suits, use the command `npm test` , this command will execute all the unit test suites defined for application.

## System flow
---

Diagram describes the Data service system flow

```mermaid
graph LR;
    B(Data Service) -->|subscribes| A[osw-validation]
    B -->|publishes| C(osw-data)
    B -->|Save| D(OSW Database)
    B -->|Auth| E(Auth Service)
    G(Gateway) -->|GET| B(Data Service)
    H(Client) -->|GET| G
```

- `Client`, makes HTTP GET calls to `Gateway`
    - Retrive the list of OSW files with/without search criteria.
    - Download the OSW file given the tdei_record_id
    
- `Data Service`, authorizes the every incoming request against the `Auth Service` 

- `Data Service`, subscribes to `osw-validation` topic to listen to data validation of the osw file upload request.

- If validation is failed , Data Service publishes the information to `osw-data` topic to update request status complete without persisting the information.

- If validation is successful , Data Service first persists the information to the `OSW Database` and publishes the information to `osw-data` topic to update request status complete.

- `osw-validation` topic message schema can be found [here](https://github.com/TaskarCenterAtUW/TDEI-event-messages/blob/dev/schema/osw-validation-schema.json)

- `osw-data` topic message schema can be found [here](https://github.com/TaskarCenterAtUW/TDEI-event-messages/blob/dev/schema/osw-validation-schema.json)



- Sample GET calls interaction with DB

```mermaid
sequenceDiagram
    Client->>+Gateway:GET(OSW)
    Gateway->>+osw-dataservice: GET
    osw-dataservice->>+osw-database: QUERY
    osw-database->>+osw-dataservice:Result
    osw-dataservice->>+Gateway:List of OSW
    Gateway->>+Client: OSW files list
```


## How to run integration test
To run integration test you need a .env file which will be available on request.

Steps to run:

Execute the following commands.

```
npm run i
```

``` 
npm run test:integration
```


## Required env for running tests

For running integration test, following env variables are required.

|Name| Description |
|--|--|
|QUEUECONNECTION | Queue connection string |
|STORAGECONNECTION | Storage connection string|
|AUTH_HOST | Host of the authentication service |
|VALIDATION_SUBSCRIPTION | Upload topic subscription name|
|VALIDATION_TOPIC | Validation topic name|
|DATASVC_TOPIC | Data service publishing topic|
