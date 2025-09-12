# Autohammer Testing

A Playwright-based testing suite that validates mobile.de search results against Autohammer branch maximum values for different locations.

## Overview

This project automates the comparison between mobile.de search results and Autohammer branch maximum values for specific locations (Radebeul and Grimma). The tests ensure data consistency and validate that the results match expected maximum values.

## Features

- ✅ Automated testing with Playwright
- 🔍 Mobile.de search result validation
- 📊 Autohammer branch maximum comparison
- 📱 Cross-browser testing (Chromium, Firefox, WebKit)
- 📸 Screenshot and video recording
- 📈 HTML test reports
- 🔔 Slack notifications (optional)
- 🚀 GitHub Actions CI/CD integration

## Prerequisites

- Node.js (version 20 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd AutohammerTesting
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory with the following configuration:

```env
# Slack Webhook Configuration (Optional)
# You can use any of these formats:

# Option 1: Single webhook URL
SLACK_WEBHOOK_URLS=XYZ

# Option 2: Multiple webhook URLs (comma or newline separated)
SLACK_WEBHOOK_URLS=XYZ,ABC

# Option 3: Numbered webhook URLs (alternative format)
SLACK_WEBHOOK_URL_1=XYZ
SLACK_WEBHOOK_URL_2=ABC
```

### GitHub Secrets

For GitHub Actions, add the following secrets in your repository settings:

- `SLACK_WEBHOOK_URLS`: Your Slack webhook URL(s) (same format as .env file)

## Usage

### Running Tests Locally

```bash
# Run all tests
npx playwright test

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run specific test file
npx playwright test tests/auto-hammer.spec.js

# Run tests with debug mode
npx playwright test --debug
```

### Viewing Test Results

```bash
# Open HTML report
npx playwright show-report

# View test results directory
ls test-results/
```

## Test Structure

### Main Test: `tests/auto-hammer.spec.js`

The main test validates mobile.de search results against Autohammer branch maximum values for:

1. **Radebeul Location** (value=3866)
2. **Grimma Location** (value=5749)

#### Test Flow:
1. Navigate to mobile.de
2. Search for vehicles in each location
3. Count search results
4. Navigate to Autohammer
5. Select the corresponding location
6. Compare results count with branch maximum
7. Validate that results match expected maximum

#### Test Configuration:
- **Timeout**: 60 seconds per test
- **Expect Timeout**: 10 seconds
- **Viewport**: 1280x800
- **Screenshots**: On failure (CI) / Always (local)
- **Video**: On failure (CI) / Always (local)

## CI/CD

### GitHub Actions

The project includes a daily scheduled workflow (`.github/workflows/daily-playwright.yml`) that:

- Runs every day at 9:00 AM UTC
- Installs dependencies and Playwright browsers
- Executes tests in headless mode
- Uploads test results and HTML reports as artifacts
- Sends Slack notifications (if configured)

### Manual Trigger

You can also trigger the workflow manually from the GitHub Actions tab.

## Project Structure

```
AutohammerTesting/
├── .github/
│   └── workflows/
│       └── daily-playwright.yml    # CI/CD configuration
├── e2e/
│   └── example.spec.js             # Example test file
├── tests/
│   └── auto-hammer.spec.js         # Main test file
├── test-results/                   # Test artifacts
├── playwright-report/              # HTML test reports
├── screenshots/                    # Test screenshots
├── playwright.config.js            # Playwright configuration
├── package.json                    # Dependencies and scripts
└── README.md                       # This file
```

## Configuration Details

### Playwright Configuration (`playwright.config.js`)

- **Test Directory**: `./tests`
- **Timeout**: 60 seconds
- **Expect Timeout**: 10 seconds
- **Retries**: 2 (CI) / 0 (local)
- **Workers**: 2 (CI) / undefined (local)
- **Headless**: true (CI) / false (local)
- **Reporter**: HTML with no auto-open

### Test Locations

| Location | Value | Description |
|----------|-------|-------------|
| Radebeul | 3866  | First test location |
| Grimma   | 5749  | Second test location |

## Troubleshooting

### Common Issues

1. **Module not found error**:
   ```bash
   npm install
   npx playwright install
   ```

2. **Browser not found**:
   ```bash
   npx playwright install --with-deps
   ```

3. **Test timeouts**:
   - Check network connectivity
   - Verify target websites are accessible
   - Increase timeout in `playwright.config.js`

4. **Slack notifications not working**:
   - Verify webhook URL format
   - Check GitHub secrets configuration
   - Ensure webhook URL starts with `https://hooks.slack.com/services/`

### Debug Mode

Run tests in debug mode to step through execution:

```bash
npx playwright test --debug
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run the test suite
6. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review test logs in `test-results/`
3. Check GitHub Actions logs for CI issues
4. Create an issue in the repository
