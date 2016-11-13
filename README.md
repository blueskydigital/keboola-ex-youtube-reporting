# Youtube Reporting API - Keboola Extractor

A Keboola Extractor for [Youtube Reporting API](https://developers.google.com/youtube/reporting). A [Node.js](https://nodejs.org/en/) + [Google API Node.js Client](https://github.com/google/google-api-nodejs-client/) has been used.

## A summary of the Google Reporting API

If you want to use this extractor, you need to understand very well the actual Youtube Reporting API and its main use-case, because in a nutshell, **you can't download any Youtube data with this extractor**.

### Content Owner

The target audience of this extractor are the **users who manage a Youtube channel authorized by Google**. An example of channel is [Kings of Horror](https://www.youtube.com/user/TheKingsofHorror). Once you manage a channel which is authorized by Google, you will get a ContentId and you can utilize this extractor and download some data.

### Youtube Reporting API Reports

The extractor helps you to download reports generated by Youtube Reporting jobs. The API is asynchronous and the key thing is to understand that **before you start using the extractor, you must set up (outside the Keboola Connection) these jobs which start generating the reports for you**.

To be more precise, each channel, which is managed by a content owner, has certain [report types](https://developers.google.com/youtube/reporting/v1/reference/rest/v1/reportTypes). These report types identify specific datasets that a channel or content owner can retrieve.

Once you know the list of report types, you can utilize the [jobs API](https://developers.google.com/youtube/reporting/v1/reference/rest/v1/jobs). You can [create](https://developers.google.com/youtube/reporting/v1/reference/rest/v1/jobs/create) a specific job, assign a report type and let the API generating data for you. After this part is set, you can start using this Youtube Reporting API - Keboola Extractor.

#### Wrap up of the process of activating jobs for starting generating of daily reports

* Make sure you have the ContentId authorized by Google.
* Get the [list of your report types](https://developers.google.com/youtube/reporting/v1/reference/rest/v1/reportTypes) assigned to your channel.
* Use the [jobs API to create processes](https://developers.google.com/youtube/reporting/v1/reference/rest/v1/jobs/create) for generating the daily reports.

### Limitation of the Youtube Reporting API

Nothing is perfect and this is true also for this API. For me the most important thing worth mentioning is that **you can only download reports generated by the processes you set on your own**. If you set up the a job process, the oldest data you can download are going to be ones not older than from today (you need to also wait until the report is generated).

## Authorization requirements

Component depends on [Google Api Node.js Client](https://github.com/google/google-api-nodejs-client/) and the crucial step is to be authorized via OAuth2.0. To make this happen you should visit the [Google Developer Console](https://console.developers.google.com/home/), select a project (or create a new one) and make sure the proper values are selected under **API Manager** section. In case of **Youtube Reporting API** the proper options are:

* OAuth2.0 client ID - this option is available once the dropdown **Add Credentials** is opened. If so, select this option.
* Application type - Other - select this option for specifying the main purpose you want to use the credentials for.
* Client ID and Client secret - after previous steps are done, you will receive these two values. You will use them for getting the last important parts of the authorization process.

### AccessToken and RefreshToken

To complete the authorization process you have to get **accessToken** and **refreshToken**. There are several ways how to manage it, I personally recommend to use either [Postman](https://www.getpostman.com/) for Chrome or [OAuth Playground](https://developers.google.com/oauthplayground/).

#### Use the OAuth Playground for getting the accessToken and refreshToken credentials

* Check **Use your own OAuth credentials** in OAuth 2.0 configuration and fill **OAuth Client ID** and **OAuth Client Secret** generated in previous steps.
* Click on **YouTube Reporting API v1** in Select & authorize APIs section and check *https://www.googleapis.com/auth/yt-analytics-monetary.readonly* and *https://www.googleapis.com/auth/yt-analytics.readonly* scopes.
* In the next steps **exchange authorization code for tokens** and copy both **accessToken** and **refreshToken**.

## Application logic

The application flow is very simple and contain following steps:

* (0) The first step is downloading the state file (if there is any). All timestamps will be used as a starting point from when the extraction part starts.
* (1) Listing all jobs and reading only the ones specified in the configuration (at least 1 must be specified).  
* (2) Application then reads all reports available in the job created after certain date (you can handle this timestamp by input config & it is updated after the extractor finishes successfully).
* (3) It is allowed to download reports for just 3 report types at the same time. For each of them the first 25 reports are selected and sent for further download (after the new process starts for the next time, it will download next 25 reports per report types).    
* (4) The downloaded data are stored incrementally in KBC and/or backuped on S3, if you specify special parameters (and s3 params).
* (5) The updates state file is going to be stored in Keboola and this prevents you from downloading the same data over and over.

### Reading of the state file (0)

The state file aggregates all timestamps which helps to download data incrementally. You can see how the file might look like:

    { "content_owner_ad_performance_a1": 1472948267, "content_owner_cards_a1": 1476937781 }

After a new configuration is created, there is no state file and a default timestamp is used for each job type. During next runs, the state file is going to be used. But you can skip to overwrite the default behavior.

There is **ignoreStateFile** parameter. It is an optional one, but if you set it to true, all timestamps from the state file are going to be skipped and the value from the **initialTimestamp** is going to be used (but the output state file is still going to be written, this is useful, when you need to download data based on the **initialTimestamp**).

Another hidden feature is to specify the **initialTimestamp** with bigger value than ones stored in the state file. For example, if you have the key **content_owner_ad_performance_a1** set to 1472948267 in the state file and you will set **initialTimestamp** to 1472948300, the latter (1472948300) will be used for the content_owner_ad_performance_a1 (but not for content_owner_cards_a1, because the timestamp > 1472948300).

### List Jobs (1)

This part lists all scheduled jobs from the API. After the list is read, the array of parameter **reportTypes** is applied and only those jobs are sent for further processing.

### Reading all available reports (2)

The **initialTimestamp** parameter (or numeric value from the report type from the state file) is going to be used as a report creation timestamp and as the earliest date from when the reports are going to be selected. This step simply iterates over all available reports (for specified jobs) and prepares a list of reports.


### Limits (3)
**There is a limitation**. This list is going to be reduced to 25 reports per report type (**you can also specify only 3 report types per configuration**), from the oldest to the newer ones.

This limit helps to manage the limitation of the Youtube Reporting API as well as the the memory used in the Docker environment for Keboola Connection.

The only implication for the end-user is that he (or she) must to run the same configuration a few times until all reports for specified report types are downloaded. Afterwards you should be fine to run the process regularly on a daily basis.

If (for some reasons) you need to reduce this limit to a lower number of reports per type (for example, the files are to big and there is some memory limitation), you can specify the parameter **batchSize**. The number must be less than or equal to 25.  

### Downloaded data (4)

Data which are going to be download with this extractor are supposed to be stored in Keboola Connection. The chunk of the report type data are merged and stored in one file named as a report type. And data are stored incrementally. You can also specify that you can do a backup on S3, or copy the files directly without storing them in Keboola Connection (handy for debugging purposes). There are two optional parameters **s3OutputOnly** and **s3Backup** which are by default set to false.

The incremental process for uploading data into Keboola Storage is handled by a **primary key**. This key is (by default) generated automatically. There are several rules associated with the process. In a nutshell, the rules contain:

* used values of the date column as a key element.
* used all non-numeric values as a part of the key.
* used fields containing any of id, status, type, code or detail as a part of the name.

These rules serve well for all major datasets. If (for some reason) there is a dataset which have some specific data, you can skip the default behavior and define your custom primary key. Let say you want to overwrite the default primary key for the **content_owner_ad_performance_a1** dataset. You can specify something like this in the input configuration:

    "customPrimaryKeys": {
      "content_owner_ad_performance_a1": [ "date", "channel_id", "video_id", "asset_id", "claimed_status", "uploader_type", "live_or_on_demand", "subscribed_status", "country_code", "playback_location_type", "playback_location_detail" ]
    }

### Storing the state file (5)

The final part is all about storing the updated state file into Keboola Connection. Keys are merged from the input configuration and if any new report was downloaded, the relevant timestamp is going to be stored on the output part.

## Configuration

To reflect the steps from above, you have to prepare the configuration. The complete configuration settings contains following information:

    {
      "#clientId": "Client Id of the content owner",
      "#clientSecret": "Client secret of the content owner",
      "#accessToken": "Access Token retrieved after OAuth2 authorization is done",
      "#refreshToken": "Refresh Token retrieved after OAuth2 authorization is done",
      "#contentOwnerId": "ID Hash of the Content Owner",
      "reportTypes": [
        "reportTypeId1", "reportTypeId2", "reportTypeId3"
      ],
      "initialTimestamp": 1464787516,
      "batchSize": 20
      "ignoreStateFile": false (optional, by default it is set to false),
      "s3OutputOnly": false (optional, by default it is set to false),
      "s3Backup": true (optional, by default it is set to false),
      "#s3AccessKeyId": "s3 access key (by default not required, needs to be specified only when you are interested in the backups)",
      "#s3SecretAccessKey": "s3 secret access key (by default not required, needs to be specified only when you are interested in the backups)",
      "s3BucketName": "s3 bucket name (by default not required, needs to be specified only when you are interested in the backups)",
      "s3RemotePath": "s3 remote path (by default not required, needs to be specified only when you are interested in the backups)",
      "customPrimaryKeys": {
        "reportTypeId1": [ "key1", ... "keyN" ],
        "reportTypeId2": [ "key1", ... "keyN" ],
        ....
        "reportTypeIdN": [ "key1", ... "keyN" ],
      }
    }

**Important note**: Attributes which contain hashes at beginning of their names mean that the values are going to be encrypted once configuration is saved. For that reason the sensitive information is well protected.

## S3 Backup

By default, this option is disabled, but you can create backups which will be stored on the S3 storage. If you set either **s3Backup** or **s3OutputOnly** to true and pass the credentials, it will create two directories **youtube_reporting_data** and **youtube_reporting_data_by_create_times**.

The first one (**youtube_reporting_data**) will store the daily increments where the filename contains the data which particular file includes. From time to time Google regenerates the reports and after certain period of time some of these reports will be rewritten (they will have a new **create date**, but the actual data are going to be for older ones). However, in order to really keep all files no matter what, the second folder (**youtube_reporting_data_by_create_times**) contain original data where the filenames contain report create time. This value is always unique which guarantees no data are going to be lost (by rewriting files).        

## Question/Issue Reporting

In case of any question/issue, don't hesitate to contact us and we can try to help you.
