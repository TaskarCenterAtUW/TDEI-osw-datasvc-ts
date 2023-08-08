# OSW Data Service Unit Test Cases

## Purpose


This document details the unit test cases for the [OSW Data Service](https://github.com/TaskarCenterAtUW/TDEI-osw-datasvc-ts)

------------

## Test Framework

Unit test cases are to be written using [Jest](https://jestjs.io/ "Jest")

------------
## Test Cases


### Test cases table definitions 
- **Component** -> Specifies the code component 
- **Feature Under Test** -> Target method name
- **Test Target** -> Specific requirement to test. ex. Functional, security etc.
- **Scenario** -> Requirement to test
- **Expectation** -> Expected result from executed scenario

### Jest code pattern

```javascript
describe("{{Component}}", () => {
	describe("{{Feature Under Test}}", () => {
		describe("{{Test Target}}", () => {  
			const getTestData => return {};
			it('{{Scenario}}, {{Expectation}}', () => {
				//Arrange
				let testData = getTestData();
				let controller = new controller();
				//Act
				const result = controller.getVersions();
				//Assert
				expect(result.status).toBe(200);
				expect(result.myAwesomeField).toBe('valid');
			});
 		});
 	});
 });
```


### Test cases

| Component | Feature Under Test | Test Target | Scenario | Expectation | Status |
|--|--|--|--|--|--|
| Controller | Get OSW list | Functional| When requested with empty search criteria | Expect to return OSW list |:white_check_mark:|
| Controller | Get OSW list | Functional| When requested with bad collection_date input | Expect to return HTTP status 400 |:white_check_mark:|
| Controller | Get OSW list | Functional| When unknown or database exception occured while processing request | Expect to return HTTP status 500 |:white_check_mark:|
| Controller | Get OSW file by Id | Functional| When requested for valid tdei_record_id | Expect to return downloadable file stream |:white_check_mark:|
| Controller | Get OSW file by Id | Functional| When requested for invalid tdei_record_id | Expect to return HTTP status 404 |:white_check_mark:|
| Controller | Get OSW file by Id | Functional| When unexpected error occured while processing request | Expect to return HTTP status 500 |:white_check_mark:|
| Controller | Create OSW version | Functional| When valid input provided | Expect to return tdei_record_id for new record |:white_check_mark:|
| Controller | Create OSW version | Functional| When provided null body | Expect to return HTTP status 500 |:white_check_mark:|
| Controller | Create OSW version | Functional| When provided body with empty tdei_org_id | Expect to return HTTP status 400|:white_check_mark:|
| Controller | Create OSW version | Functional| When provided body with invalid polygon | Expect to return HTTP status 400|:white_check_mark:|
| Controller | Create OSW version | Functional| When database exception occured while processing request | Expect to return HTTP status 500|:white_check_mark:|
| Controller | Create OSW version | Functional| When database exception with duplicate tdei_org_id occured while processing request | Expect to return HTTP status 400|:white_check_mark:|
|--|--|--|--|--|--|
| OSW Service | Get all OSW | Functional| When requested with empty search filters | Expect to return OSW list |:white_check_mark:|
| OSW Service | Get all OSW | Functional| When requested with all search filters| Expect to return OSW list |:white_check_mark:|
| OSW Service | Get all OSW | Functional| When requested with invalid date search filter| Expect to throw InputException |:white_check_mark:|
| OSW Service | Get all OSW | Functional| When requested with invalid bbox search filter| Expect to throw InputException |:white_check_mark:|
| OSW Service | Get OSW version by Id | Functional| When requested for get OSW version by tdei_record_id| Expect to return FileEntity object |:white_check_mark:|
| OSW Service | Get OSW version by Id | Functional| When requested for get OSW version with invalid tdei_record_id| Expect to throw HttpException |:white_check_mark:|
| OSW Service | Get OSW version by Id | Functional| When Core failed obtaing storage client| Expect to throw error |:white_check_mark:|
| OSW Service | Create OSW version | Functional| When requested for creating OSW version with valid input| Expect to return OswDTO object |:white_check_mark:|
| OSW Service | Create OSW version | Functional| When database exception with duplicate tdei_org_id occured while processing request| Expect to throw DuplicateException |:white_check_mark:|
| OSW Service | Create OSW version | Functional| When database exception occured while processing request| Expect to throw error |:white_check_mark:|
|--|--|--|--|--|--|
 | Queue message service | Process Queue message | Functional| When valid message received| Expect to process the message successfully |:white_check_mark:|
| Queue message service | Process Queue message | Functional| When message with empty tdei_record_id received| Expect to fail the message processing |:white_check_mark:|
| Queue message service | Process Queue message | Functional| When validation service failed| Expect to fail the message processing |:white_check_mark:|
| Queue message service | Process Queue message | Functional| When create OSW database failed| Expect to fail the message processing |:white_check_mark:|
| Queue message service | Process Queue message | Functional| When permission denied| Expect to fail the message processing |:white_check_mark:|

### Integration Test cases

| Component | Feature Under Test | Scenario | Expectation | Status |
|--|--|--|--|--|
| OSW Service | Servicebus Integration | Subscribe to validation result topic to verify servicebus integration| Expect to return message |:white_check_mark:|
| OSW Service | Permission Request | Verifying auth service hasPermission api integration| Expect to return false |:white_check_mark:|
| OSW Service | Auth service | Verifying auth service generate secret api integration | Expect to return HTTP status 200 |:white_check_mark:|