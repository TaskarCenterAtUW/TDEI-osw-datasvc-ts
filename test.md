# Auth Service Unit Test Cases

## Purpose

This document details the unit test cases for
the [Auth Service](https://github.com/TaskarCenterAtUW/TDEI-auth-n-z)

------------

## Test Framework

Unit test cases are to be written using [JUnit](https://junit.org/junit5/)

------------

### Test cases

| Component | Feature Under Test | Test Target | Scenario | Expectation | Status |
|--|--|--|--|--|--|
| Controller | Validate API key | Functional| When validating the valid API key | Expect to return HTTP Status 200 with user profile details |:white_check_mark:|
| Controller | Validate API key | Functional| When validating the invalid API key| Expect to throw InvalidKeyException |:white_check_mark:|
| Controller | Validate Access Token | Functional| When validating the valid Access Token| Expect to return HTTP Status 200 with user profile details |:white_check_mark:|
| Controller | Validate Access Token | Functional| When validating the invalid Access Token| Expect to throw InvalidAccessTokenException |:white_check_mark:|
| Controller | Authenticate | Functional| When authenticating user with valid credentials| Expect to return HTTP Status 200 with TokenResponse details |:white_check_mark:|
| Controller | Authenticate | Functional| When authenticating user with invalid credentials| Expect to throw InvalidCredentialsException |:white_check_mark:|
| Controller | Has permission | Functional| When verifying the user permission with valid userid| orgid and matching roles| Expect to return true |:white_check_mark:|
| Controller | Has permission | Functional| When verifying the user permission with valid userid| orgid and not matching roles| Expect to return false |:white_check_mark:|
| Controller | Refresh Token | Functional| When refreshing the valid refresh token| Expect to return TokenResponse |:white_check_mark:|
| Controller | Refresh Token | Functional| When refreshing the invalid refresh token| Expect to throw InvalidAccessTokenException |:white_check_mark:|
| Controller | Generate Secret | Functional| When requested to generate secret token| Expect to return secret token |:white_check_mark:|
| Controller | Validate Secret | Functional| When requested to validate secret token| Expect to return true on success |:white_check_mark:|
| Controller | Register User | Functional| When requested to register new user| Expect to return UserProfile on success |:white_check_mark:|
| Controller | Register User | Functional| When requested to register new user with existing email| Expect to throw UserExistsException |:white_check_mark:|
| Controller | Get user by username | Functional| When requested get user details by username| Expect to return UserProfile details on success |:white_check_mark:|
| Controller | Get user by username | Functional| When requested get user details by invalid username| Expect to return HTTP Status 404 |:white_check_mark:|
|--|--|--|--|--|--|
| Keycloak Service | Validate API key | Functional| When searching for user by valid api-key| Expect to return User details |:white_check_mark:|
| Keycloak Service | Validate API key | Functional| When searching for user by invalid api-key| Expect to throw InvalidKeyException |:white_check_mark:|
| Keycloak Service | Validate Access Token | Functional| When searching for user by valid access token| Expect to return userinfo |:white_check_mark:|
| Keycloak Service | Validate Access Token | Functional| When searching for user by invalid access token| Expect to throw InvalidAccessTokenException |:white_check_mark:|
| Keycloak Service | Get user by username | Functional| When searching for the user by valid user name| Expect to return userinfo |:white_check_mark:|
| Keycloak Service | Get user by username | Functional| When searching for the user by invalid user name| Expect to return null |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid , orgId and roles| Expect to return true |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid, role and invalid orgId| Expect to return false|:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid, role and empty orgId| Expect to return true |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid, orgId and invalid roles| Expect to return false |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid, empty orgId and invalid roles| Expect to return false |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid, orgId , must exists roles and on partial role match| Expect to return false |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid, orgId , must exists roles and on partial role match| Expect to return true when affirmative flag is false |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid, empty orgId , must exists roles and on partial role match| Expect to return false |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions with valid userid, empty orgId , must exists roles and on partial role match| Expect to return true when affirmative flag is false |:white_check_mark:|
| Keycloak Service | Has permission | Functional| When validating user permissions where user is admin| Expect to return true |:white_check_mark:|
| Keycloak Service | Register user | Functional| When registering new user | Expect to return userprofile on success |:white_check_mark:|
| Keycloak Service | Register user | Functional| When registering new user with existing user email | Expect to throw UserExistsException |:white_check_mark:|
| Keycloak Service | Refresh token | Functional| When requested to re-issue token given valid refresh token| Expect to return TokenResponse on success |:white_check_mark:|
| Keycloak Service | Refresh token | Functional| When requested to re-issue token given expired refresh token| Expect to throw InvalidAccessTokenException |:white_check_mark:|
| Keycloak Service | Generate Secret | Functional| When requested to generate secret token| Expect to return secret token |:white_check_mark:|
| Keycloak Service | Validate Secret | Functional| When requested to validate secret token| Expect to return true on success |:white_check_mark:|
| Keycloak Service | Validate Secret | Functional| When requested to validate invalid secret token| Expect to return false |:white_check_mark:|
