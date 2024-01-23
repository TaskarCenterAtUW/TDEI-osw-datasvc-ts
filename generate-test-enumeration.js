const jest = require('jest');
const fs = require('fs');

async function runTests() {
    try {
        const config = {
            preset: 'ts-jest',
            testEnvironment: 'node',
            clearMocks: true,
            restoreMocks: true,
            coverageProvider: "v8",
            moduleFileExtensions: ["js", "jsx", "ts", "tsx", "json", "node"],
            transform: {
                "^.+\\.(ts|tsx|js)$": "ts-jest",
            },
        };

        const { results } = await jest.runCLI(config, [process.cwd()]);

        // Generate Markdown file
        generateMarkdown(results.testResults);

        if (results.success) {
            console.log('All tests passed!');
        } else {
            console.log('Some tests failed.');
        }
    } catch (error) {
        console.error('Error running Jest tests:', error);
    }
}


function generateMarkdown(jsonData) {
    const testResults = [];

    for (let index = 0; index < jsonData.length; index++) {
        const element = jsonData[index].testResults.map(formatTestResult).join('\n');
        testResults.push(element);
    }

    const markdownContent = `
# OSW Data Service Unit Test Cases

## Purpose


This document details the unit test cases for the [OSW Data Service](https://github.com/TaskarCenterAtUW/TDEI-osw-datasvc-ts)

------------

## Test Framework

Unit test cases are to be written using [Jest](https://jestjs.io/ "Jest")

------------

### Jest code pattern

\`\`\`javascript
    describe("User Controller", () => {
        describe("Get List", () => {
            describe("Functional", () => {
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
\`\`\`

------------

## Test Cases

|Feature Under Test | Test Case Description | Status |
|-------------------------------------------------------------------------------------|---------|---------------|
${testResults.join('\n')}`;

    fs.writeFileSync('test-enumeration.md', markdownContent);
}

function formatTestResult(testResult) {
    return `| ${testResult.ancestorTitles.join(' -> ')} | ${testResult.title} | ${testResult.status} |`;
}

// Run the tests
runTests();
