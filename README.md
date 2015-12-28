# Youtube Reporting API - Keboola Extractor

A Keboola Extractor for [Youtube Reporting API](https://developers.google.com/youtube/reporting). A [Node.js](https://nodejs.org/en/) + [Google Api Node.js Client](https://github.com/google/google-api-nodejs-client/) has been used.

## Authorization requirements

Component depends on [Google Api Node.js Client](https://github.com/google/google-api-nodejs-client/) and the cruicial step is to enable the possibility of making a request for OAuth2.0. To make this happen you should visit the [Google Developer Console](https://console.developers.google.com/home/), select a project (or create a new one) and make sure the proper values are selected under **API Manager** section. In case of **Youtube Reporting API** the proper options are:

* OAuth2.0 client ID - this option is available once the dropdown **Add Credentials** is opened. If so, select this option.
* Application type - Other - select this option for specifying the main purpose you want to use the credentials for.
* Client ID and Client secret - after previous steps are done, you will receive these two values. You will use them for getting the last important parts of the authorization process.

### Access_Token and Refresh_Token

To complete the authorization process you have to get **Refresh_Token** and **Access_Token**. There are several ways how to do it, I personally recommend to use [OAuth Playground](https://developers.google.com/oauthplayground/). There is a configuration part. It is neccessary to do following:

* Check **Use your own OAuth credentials** in OAuth 2.0 configuration and fill **OAuth Client ID** and **OAuth Client Secret** generated in previous steps.
* Click on **YouTube Reporting API v1** in Select & authorize APIs section and check *https://www.googleapis.com/auth/yt-analytics-monetary.readonly* and *https://www.googleapis.com/auth/yt-analytics.readonly* scopes.
* In the next steps **exchange authorization code for tokens** and copy both **Access_Token** and **Refresh_Token**.

## Application logic

The application flow is very simple and contain following steps:

### List Jobs

This task list all scheduled jobs in the API. Due to small limits on API level, there is a filtering which help to reduce number of API call significantly. Check **report_types** attribute in the config. Once specified, the API will process the objects from the array only.

### Read State File

Keboola stores the state file after the synchronization is done successfully. This helps to receive that state file and continue with the file processing containing new data only (this step also helps to reduce the number of API calls).

### Check the jobs data

Another steps is to check the resource for jobs and get the list of reports for next download.

### Download list of the reports

Once the list of report is preprared, the download process begin and prepare the result for storing to the KBC. If job doesn't contain any new report, no action is taken.

### Store the state file to KBC

This is the last step and basically the final configuration is stored in Keboola for further downloads.

## Configuration

To reflect the steps from above, you have to prepare the configuration. The complete configuration settings contains following information:

    {
      "parameters": {
        "#onBehalfOfContentOwner": "ID Hash of the Content Owner",
        "scopes": [
          "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
          "https://www.googleapis.com/auth/yt-analytics.readonly"
        ],

        "#clientId": "Client Id of the content owner",
        "#clientSecret": "Client secret of the content owner",
        "redirectUrl": "urn:ietf:wg:oauth:2.0:oob",
        "#refresh_token": "Refresh token generated in the second part",
        "#access_token": "Access Token generated in the second part",
        "expiry_date": 1234567890,
        "pagination": 300,
        "bucket": "in.c-ex_youtube_reporting",
        "report_types": ["reportTypeId1", "reportTypeId2", ....., "reportTypeIdN"],

        "primary_keys": {
          "reportTypeId1": ["key1", ... "keyN"],
          "reportTypeId2": ["key1", ... "keyN"],
          .
          .
          .
          .
          "reportTypeIdN": ["key1", ... "keyN"]
        },
        "initial_timestamp": 1234567890,
        "maximum_timestamp": 1234567890
      }
    }

Important note: The attibutes which contains hashes at beginning of their name mean that the values are going to be encrypted once configuration is saved. For that reason the sensitive information is well protected.

### Primary keys

As there is data with daily grain, it's recommended to setup primary keys to make sure the increments will be stored properly. There is an attribute "primary_keys" in configuration. Due to some platform limitation, the values specified in the keys array are stored as a MD5 column (always 'id' one). You can check a possible examples below (a content owner used):

    {
      "content_owner_asset_demographics_a1":["date","channel_id","video_id","asset_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","age_group","gender"],
      "content_owner_traffic_source_a1":["date","channel_id","video_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","traffic_source_type","traffic_source_detail"],
      "content_owner_asset_estimated_earnings_a1":["date","channel_id","video_id","asset_id","claimed_status","uploader_type","country_code"],
      "content_owner_asset_combined_a1":["date","channel_id","video_id","asset_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","playback_location_type","traffic_source_type","device_type","operating_system"],
      "content_owner_ad_performance_a1":["date","channel_id","video_id","claimed_status","uploader_type","country_code","ad_type"],
      "content_owner_asset_annotations_a1":["date","channel_id","video_id","asset_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","annotation_type"],
      "content_owner_asset_cards_a1":["date","channel_id","video_id","asset_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","card_type"],
      "content_owner_demographics_a1":["date","channel_id","video_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","age_group","gender"],
      "content_owner_asset_traffic_source_a1":["date","channel_id","video_id","asset_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","traffic_source_type","traffic_source_detail"],
      "content_owner_estimated_earnings_a1":["date","channel_id","video_id","claimed_status","uploader_type","country_code"],
      "content_owner_combined_a1":["date","channel_id","video_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","playback_location_type","traffic_source_type","device_type","operating_system"],
      "content_owner_annotations_a1":["date","channel_id","video_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","annotation_type"],
      "content_owner_cards_a1":["date","channel_id","video_id","claimed_status","uploader_type","live_or_on_demand","subscribed_status","country_code","card_type"]
    }

## Limitation

The current solution is the first iteration of the new Youtube Reporting API. There are several limitations in the current version, like:

* Proper pagination: Currently there is a very basic implementation of the pagination. Just download the reports from 1..N (N=number in pagination attribute). The API itself supports a better way how to do it, just need to be implemented. Plan for the next version

* ReportTypeId Limitation: The extractor works in a way that you have to have a list of scheduled jobs containing ReportTypeId **just once** (More than 1 job containing the same ReportTypeId is not allowed).

There is a plan to improve that in further version, currently is necessary to be aware of this such a limitation.

## Question/Issue Reporting

In case of any question/issue, feel free to write an email at <radek@bluesky.pro>. I am more than happy to help you.
