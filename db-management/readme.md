## Database Management

- The `create-tables-master-script.sql` file comprises the most current create table scripts. It should be regularly updated with the latest create table script whenever there are additions, deletions, or modifications to any tables.

- For new features or releases, generate new migrations using the following command:

  ```
  npx db-migrate create {name-of-migration}
  ```

  Example: `npx db-migrate create add-user`

- The `npx db-migrate` command generates three files under the `./db-management/migrations` folder, namely:
    - `{timestamp}-{name-of-migration}.js`
    - `./sqls/{timestamp}-{name-of-migration}-up.js`
    - `./sqls/{timestamp}-{name-of-migration}-down.js`

- The `*-up` file should contain the new changes for the release, while the `*-down` file should include the rollback script for the release in case of deployment failure.

- Avoid adding owner scripts to migrations. For instance:

  ```sql
  ALTER TABLE IF EXISTS public.osw_formatting_jobs
      OWNER to tdeiadmin;
  ```

- Running the `npm start` command executes the database migrations. The `npm start` script is configured to run `npx db-migrate up`, which in turn runs the necessary database migrations. The `db-migrate` tool checks the target database by consulting the `tdei_migrations` table to determine which migrations need to be applied.