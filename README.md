# Home Finder Script
This is the "backend" scraping script for the [Home Finder](https://github.com/WeRules/home-finder) project.

## How to deploy this project

If you want to also deploy the frontend website, [read it here](https://github.com/WeRules/home-finder#how-to-deploy).

To deploy this project, you will need to do the following steps:

1. Clone the project using the `Use this template` button on GitHub and make sure to change the project to private, otherwise you may leak user data.
2. Update the `template.html` to use your own website URL
    1. or if you're skipping the frontend, you can simply remove the link in the footer of the email.
3. Get the Google Spreadsheet from the previously created form and make sure to [publish the Google Spreadsheet to the web](https://support.google.com/a/users/answer/9308870) and make it available to anyone with the link too.
    1. or if you're skipping the frontend any Google Spreadsheet will do, but the spreadsheet needs to have the same header fields as the Google Forms.
4. Get the Google Spreadsheet `ID` and `Grid ID`, for example, [for this spreadsheet](https://docs.google.com/spreadsheets/d/1jRMEvfI6OsWUwnaHgH5UwnoikZA0a3s8wPnCortNJ_A/edit#gid=0), the `ID` is `1jRMEvfI6OsWUwnaHgH5UwnoikZA0a3s8wPnCortNJ_A` and the `Grid ID` is `0`.
5. Add 5 new [repo's secret](https://docs.github.com/en/actions/reference/encrypted-secrets):
    1. `EMAIL_USER`: The Gmail email that will be used to send emails.
    2. `EMAIL_PASSWORD`: The password of the Gmail account. It's highly recommended that you [create an App Password](https://support.google.com/mail/answer/185833?hl=en-US) for that.
    3. `GOOGLE_SPREADSHEET_ID`: The Google Spreadsheet `ID`.
    4. `GOOGLE_SPREADSHEET_GID`: The Google Spreadsheet `Grid ID`.
    5. `TELEGRAM_BOT_ID`: The Telegram Bot ID.
    6. `USER_AGENT`: The user-agent to be used by the scraper script. You can use [your own user-agent](https://www.whatismybrowser.com/detect/what-is-my-user-agent/) if you want.
6. Update [the cron job frequency](https://github.com/WeRules/home-finder-script/blob/main/.github/workflows/run-task.yml#L5) to match your needs.
7. Push your changes to the `main` branch and the script will automatically run accordingly with the cron job settings.

## Release Notes
- **v0.3.0:**
   - Add Telegram notifications support
- **v0.2.0:**
   - Add check for valid email and valid URL
   - Add bugs to fix later
- **v0.1.0:**
   - First version

## Donate
Do you like this project? [🥤 Buy me a soda](https://bunq.me/BuyMeASoda)
