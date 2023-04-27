# Introduction 
Data service micro-service helps TDEI system to query information specific to the OSW.

# Getting Started
The project is built on top of NodeJS framework. All the regular nuances for a NodeJS project are valid for this.

## System requirements
| Software | Version|
|----|---|
| NodeJS | 16.17.0|
| Typescript | 4.8.2 |

### Local setup
Step 1: 
```docker compose up from root directory```

### Environment variables
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

An example of this is environment file is available [here](./env.example)

#### Build and Test
Follow the steps to install the node packages required for both building and running the application

1. Install the dependencies. Run the following command in terminal on the same directory as `package.json`
    ```shell
    npm install
    ```
2. To start the server, use the command `npm run start`
3. The http server by default starts with 3000 port or whatever is declared in `process.env.PORT` (look at `index.ts` for more details)
4. By default `get` call on `localhost:3000` gives a sample response
5. Other routes include a `ping` with get and post. Make `get` or `post` request to `http://localhost:3000/ping`



