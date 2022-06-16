# stream-tab

cast one or more web pages to one or more chrome devices programatically.
Very useful for streaming your dashboards!

* Auto restarts stream if ffmpeg or chromecast crashes
* uses a custom app to hide control bars (APP ID 62EFD2C1)
* can stream one tab to several chromecasts
* allows you to set cookies (e.g. for login or similar things)

# Introduction
This app starts a puppeteer browser instance (in headless mode) and streams the 
screen to specified chromecast devices. 

To get things started you need:
* one webpage you would like to stream ;)
* a chromecast device in your network

# Setup
1. Clone this repository and run `npm install`
2. run `npm run build` 
3. rename config.example.json to config.json and adapt it to your needs
4. start it with `npm run start`

## Config File

| Parameter         | Description                                                                                                                                                                                                                                                                                                                | Default Value |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------|
| networkInterface  | the network address where the server should run on, e.g. 192.168.0.1                                                                                                                                                                                                                                                       |            |
| ffmpegExecutable  | the path to the ffmpeg executable                                                                                                                                                                                                                                                                                          | ffmpeg     |
| browserExecutable | path to a custom chromium/chrome installation, see [https://github.com/puppeteer/puppeteer/blob/main/docs/api.md#puppeteerlaunchoptions](Puppeteer Launch Options). E.g. you can set it also to your chrome installation. You need to use chrome (not chromium) if you want to use "directRenderMode"                      | null       |
| directRenderMode  | this allows to skip one transformation via ffmpeg and retrieves the stream in a h264 format. this improves performance, but needs a chrome (not chromium!) as browser instance (set browserExecutable). Furthermore this works best on Windows, not Linux unfortunately.                                                   | false      |
| chromecastMapping | specifies which device should get which website stream, you can specify the same stream for several devices. E.g. <pre>{ <br>	"Küche": "KitchenScreen", <br>	"Inside Sales": "InsideSalesScreen", <br>	"Dev": "DevScreen", <br>        "Dev 2": "DevScreen"<br> }</pre>  this field is optional, if default screen is set. |            |
| defaultScreen     | for not explicitly mapped chromecast devices, which stream should be used                                                                                                                                                                                                                                                  |           |
| screens           | defines which streams / screens are avaialble. bascially what websites you want to stream.                                                                                                                                                                                                                                 |           |
| screens.url       | the url of the website                                                                                                                                                                                                                                                                                                     |           |
| screens.name      | a name that you use for chromecastMapping and the defaultScreen config                                                                                                                                                                                                                                                     |           |
| screens.cookies   | a name/value pair for setting cookies (optional)                                                                                                                                                                                                                                                                           |            |

# Known Issues
* Without setting directRenderMode to true the performance can be bad, even with the setting set to true you can run into limits easily if you have several streams running. Unfortunately I haven't found a better way yet for videocasting including audio yet.
* Can crash due to bugs in used libraries, therefore you pm2 or other process manager to auto restart the process 
 
CONTRIBUTIONS WELCOME! If you are willing to help, just open a PR or contact me via bug system or simon.tretter@hokify.com.


