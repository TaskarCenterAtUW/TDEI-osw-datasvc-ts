if (process.env.TEST_ENV === 'integration') {
    require('jest-fetch-mock').disableMocks();
} else {
    require('jest-fetch-mock').enableMocks();
}