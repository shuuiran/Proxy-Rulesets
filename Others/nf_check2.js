const STATUS_FULL_AVAILABLE = 2 // 完整支持
const STATUS_ORIGINAL_AVAILABLE = 1 // 支持自制劇
const STATUS_NOT_AVAILABLE = 0 // 不支持解鎖
const STATUS_TIMEOUT = -1 // 檢測超時
const STATUS_ERROR = -2 // 檢測異常

const $ = new Env('Netflix 解鎖檢測')
let policyName = $.getval('Helge_0x00.Netflix_Policy') || 'Netflix'
let debug = $.getval('Helge_0x00.Netflix_Debug') === 'true'
let retry = $.getval('Helge_0x00.Netflix_Retry') === 'true'
let t = parseInt($.getval('Helge_0x00.Netflix_Timeout')) || 8000
let sortByTime = $.getval('Helge_0x00.Netflix_Sort_By_Time') === 'true'
let concurrency = parseInt($.getval('Helge_0x00.Netflix_Concurrency')) || 10

;(async () => {
  if (!$.isQuanX()) {
    throw '該腳本僅支持在 Quantumult X 中運行'
  }

  let policies = await sendMessage({ action: 'get_customized_policy' })
  if (!isValidPolicy(policies[policyName])) {
    policyName = lookupTargetPolicy(policies)
    console.log(`更新策略組名稱 ➟ ${policyName}`)
    $.setval(policyName, 'Helge_0x00.Netflix_Policy')
  }
  let candidatePolicies = lookupChildrenNode(policies, policyName)

  let { fullAvailablePolicies, originalAvailablePolicies } = await testPolicies(policyName, candidatePolicies)
  if (sortByTime) {
    fullAvailablePolicies = fullAvailablePolicies.sort((m, n) => m.time - n.time)
    originalAvailablePolicies = originalAvailablePolicies.sort((m, n) => m.time - n.time)
  }
  $.setval(JSON.stringify(fullAvailablePolicies), 'Helge_0x00.Netflix_Full_Available_Policies')
  $.setval(JSON.stringify(originalAvailablePolicies), 'Helge_0x00.Netflix_Original_Available_Policies')
})()
  .catch(error => {
    console.log(error)
    if (typeof error === 'string') {
      $.msg($.name, '', `${error} ⚠️`)
    }
  })
  .finally(() => {
    $.done()
  })

async function testPolicies(policyName, policies = []) {
  let failedPolicies = []
  let fullAvailablePolicies = []
  let originalAvailablePolicies = []
  let echo = results => {
    console.log(`\n策略組 ${policyName} 檢測結果：`)
    for (let { policy, status, region, time } of results) {
      switch (status) {
        case STATUS_FULL_AVAILABLE: {
          let flag = getCountryFlagEmoji(region) ?? ''
          let regionName = REGIONS?.[region.toUpperCase()]?.chinese ?? ''
          console.log(`${policy}: 完整支持 Netflix ➟ ${flag}${regionName}`)
          fullAvailablePolicies.push({ policy, region, status, time })
          break
        }
        case STATUS_ORIGINAL_AVAILABLE: {
          let flag = getCountryFlagEmoji(region) ?? ''
          let regionName = REGIONS?.[region.toUpperCase()]?.chinese ?? ''
          console.log(`${policy}: 僅支持自制劇 ➟ ${flag}${regionName}`)
          originalAvailablePolicies.push({ policy, region, status, time })
          break
        }
        case STATUS_NOT_AVAILABLE:
          console.log(`${policy}: 不支持 Netflix`)
          break
        case STATUS_TIMEOUT:
          console.log(`${policy}: 檢測超時`)
          failedPolicies.push(policy)
          break
        default:
          console.log(`${policy}: 檢測異常`)
          failedPolicies.push(policy)
      }
    }
  }

  await Promise.map(policies, subPolicy => test(subPolicy), { concurrency })
    .then(echo)
    .catch(error => console.log(error))

  if (retry && failedPolicies.length > 0) {
    await Promise.map(failedPolicies, subPolicy => test(subPolicy), { concurrency })
      .then(echo)
      .catch(error => console.log(error))
  }

  return { fullAvailablePolicies, originalAvailablePolicies }
}

function getFilmPage(filmId, policyName) {
  return new Promise((resolve, reject) => {
    let request = {
      url: `https://www.netflix.com/title/${filmId}`,
      opts: {
        redirection: false,
        policy: policyName,
      },
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36',
      },
    }
    $task.fetch(request).then(
      response => {
        let {
          statusCode,
          headers: { Location: location, 'X-Originating-URL': originatingUrl },
        } = response

        if (statusCode === 403) {
          reject('Not Available')
          return
        }

        if (statusCode === 404) {
          reject('Not Found')
          return
        }

        if (statusCode === 302 || statusCode === 301 || statusCode === 200) {
          if (debug) {
            if (statusCode === 200) {
              console.log(`${policyName} filmId: ${filmId}, statusCode: ${statusCode}, X-Originating-URL: ${originatingUrl}`)
            } else {
              console.log(`${policyName} filmId: ${filmId}, statusCode: ${statusCode}, Location: ${location}`)
            }
          }

          let url = location ?? originatingUrl
          let region = url.split('/')[3]
          region = region.split('-')[0]
          if (region === 'title') {
            region = 'US'
          }
          resolve(region.toUpperCase())
          return
        }

        if (debug) {
          console.log(`${policyName} filmId: ${filmId}, statusCode: ${statusCode}, response: ${JSON.stringify(response)}`)
        }
        reject('Not Available')
      },
      reason => {
        if (debug) {
          console.log(`${policyName} getFilmPage Error: ${reason.error}`)
        }
        reject('Error')
      }
    )
  })
}

async function test(policyName) {
  console.log(`開始測試 ${policyName}`)
  let startTime = new Date().getTime()
  let result = await Promise.race([getFilmPage(81215567, policyName), timeout(t)])
    .then(region => {
      return { region, policy: policyName, status: STATUS_FULL_AVAILABLE }
    })
    .catch(async error => {
      if (error !== 'Not Found') {
        return Promise.reject(error)
      }

      let region = await Promise.race([getFilmPage(80018499, policyName), timeout(t)])
      return { region, policy: policyName, status: STATUS_ORIGINAL_AVAILABLE }
    })
    .catch(error => {
      if (error === 'Not Available') {
        return { policy: policyName, status: STATUS_NOT_AVAILABLE }
      } else if (error === 'Timeout') {
        return { policy: policyName, status: STATUS_TIMEOUT }
      }

      return { policy: policyName, status: STATUS_ERROR }
    })
  return Object.assign(result, { time: new Date().getTime() - startTime })
}

function timeout(delay = 5000) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject('Timeout')
    }, delay)
  })
}

function getCountryFlagEmoji(countryCode) {
  if (countryCode.toUpperCase() === 'TW') {
    countryCode = 'TW'
  }
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt())
  return String.fromCodePoint(...codePoints)
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    $configuration.sendMessage(message).then(
      response => {
        if (response.error) {
          if (debug) {
            console.log(`${message?.action} error: ${response.error}`)
          }
          reject(response.error)
          return
        }

        resolve(response.ret)
      },
      error => {
        // Normally will never happen.
        reject(error)
      }
    )
  })
}

function lookupChildrenNode(policies = {}, targetPolicyName) {
  let targetPolicy = policies[targetPolicyName]
  if (!isValidPolicy(targetPolicy)) {
    throw '策略組名未填寫或填寫有誤，請在 BoxJS 中填寫正確的策略組名稱'
  }
  if (targetPolicy?.type !== 'static') {
    throw `${targetPolicyName} 不是 static 類型的策略組`
  }
  if (targetPolicy.candidates.length <= 0) {
    throw `${targetPolicyName} 策略組為空`
  }
  let candidates = new Set()

  let looked = new Set()
  let looking = [targetPolicyName]

  while (looking.length > 0) {
    let curPolicyGroupName = looking.shift()
    looked.add(curPolicyGroupName)
    for (const policy of policies[curPolicyGroupName].candidates) {
      // 排除 proxy 和 reject 兩個特殊策略
      if (policy === 'proxy' || policy === 'reject') {
        continue
      }
      // 如果不是自定義策略，那麼就應該是一個節點
      if (policies[policy] === undefined) {
        candidates.add(policy)
        continue
      }

      // 沒有遍歷過的策略，也不是即將遍歷的策略
      if (!looked.has(policy) && !looking.includes(policy)) {
        looking.push(policy)
      }
    }
  }

  return [...candidates]
}

function lookupTargetPolicy(policies = {}) {
  let policyNames = Object.entries(policies)
    .filter(([key, val]) => key.search(/Netflix|奈飛/gi) !== -1)
    .map(([key, val]) => key)
  if (policyNames.length === 1) {
    return policyNames[0]
  } else if (policyNames.length <= 0) {
    throw '沒有找到 Netflix 策略組，請在 BoxJS 中填寫正確的策略組名稱'
  } else {
    throw `找到多個 Netflix 策略組，請在 BoxJS 中填寫正確的策略組名稱`
  }
}

function isValidPolicy(policy) {
  return policy !== undefined && policy?.type !== undefined && Array.isArray(policy?.candidates)
}

// prettier-ignore
Array.prototype.remove=function(e){let t=this.indexOf(e);-1!==t&&this.splice(t,1)}

// prettier-ignore
Promise.map=function(t,e,{concurrency:u}){const i=new class{constructor(t){this.limit=t,this.count=0,this.queue=[]}enqueue(t){return new Promise((e,u)=>{this.queue.push({fn:t,resolve:e,reject:u})})}dequeue(){if(this.count<this.limit&&this.queue.length){const{fn:t,resolve:e,reject:u}=this.queue.shift();this.run(t).then(e).catch(u)}}async run(t){this.count++;const e=await t();return this.count--,this.dequeue(),e}build(t){return this.count<this.limit?this.run(t):this.enqueue(t)}}(u);return Promise.all(t.map((...t)=>i.build(()=>e(...t))))}

// prettier-ignore
const REGIONS={AF:{chinese:'阿富汗',english:'Afghanistan'},AL:{chinese:'阿爾巴尼亞',english:'Albania'},DZ:{chinese:'阿爾及利亞',english:'Algeria'},AO:{chinese:'安哥拉',english:'Angola'},AR:{chinese:'阿根廷',english:'Argentina'},AM:{chinese:'亞美尼亞',english:'Armenia'},AU:{chinese:'澳大利亞',english:'Australia'},AT:{chinese:'奧地利',english:'Austria'},AZ:{chinese:'阿塞拜疆',english:'Azerbaijan'},BH:{chinese:'巴林',english:'Bahrain'},BD:{chinese:'孟加拉國',english:'Bangladesh'},BY:{chinese:'白俄羅斯',english:'Belarus'},BE:{chinese:'比利時',english:'Belgium'},BZ:{chinese:'伯利茲',english:'Belize'},BJ:{chinese:'貝寧',english:'Benin'},BT:{chinese:'不丹',english:'Bhutan'},BO:{chinese:'玻利維亞',english:'Bolivia'},BA:{chinese:'波黑',english:'Bosnia and Herzegovina'},BW:{chinese:'博茨瓦納',english:'Botswana'},BR:{chinese:'巴西',english:'Brazil'},VG:{chinese:'英屬維京群島',english:'British Virgin Islands'},BN:{chinese:'文萊',english:'Brunei'},BG:{chinese:'保加利亞',english:'Bulgaria'},BF:{chinese:'布基納法索',english:'Burkina-faso'},BI:{chinese:'布隆迪',english:'Burundi'},KH:{chinese:'柬埔寨',english:'Cambodia'},CM:{chinese:'喀麥隆',english:'Cameroon'},CA:{chinese:'加拿大',english:'Canada'},CV:{chinese:'佛得角',english:'Cape Verde'},KY:{chinese:'開曼群島',english:'Cayman Islands'},CF:{chinese:'中非',english:'Central African Republic'},TD:{chinese:'乍得',english:'Chad'},CL:{chinese:'智利',english:'Chile'},CN:{chinese:'中國',english:'China'},CO:{chinese:'哥倫比亞',english:'Colombia'},KM:{chinese:'科摩羅',english:'Comoros'},CG:{chinese:'剛果(布)',english:'Congo - Brazzaville'},CD:{chinese:'剛果(金)',english:'Congo - Kinshasa'},CR:{chinese:'哥斯達黎加',english:'Costa Rica'},HR:{chinese:'克羅地亞',english:'Croatia'},CY:{chinese:'塞浦路斯',english:'Cyprus'},CZ:{chinese:'捷克',english:'Czech Republic'},DK:{chinese:'丹麥',english:'Denmark'},DJ:{chinese:'吉布提',english:'Djibouti'},DO:{chinese:'多米尼加',english:'Dominican Republic'},EC:{chinese:'厄瓜多爾',english:'Ecuador'},EG:{chinese:'埃及',english:'Egypt'},SV:{chinese:'薩爾瓦多',english:'EI Salvador'},GQ:{chinese:'赤道幾內亞',english:'Equatorial Guinea'},ER:{chinese:'厄立特里亞',english:'Eritrea'},EE:{chinese:'愛沙尼亞',english:'Estonia'},ET:{chinese:'埃塞俄比亞',english:'Ethiopia'},FJ:{chinese:'斐濟',english:'Fiji'},FI:{chinese:'芬蘭',english:'Finland'},FR:{chinese:'法國',english:'France'},GA:{chinese:'加蓬',english:'Gabon'},GM:{chinese:'岡比亞',english:'Gambia'},GE:{chinese:'格魯吉亞',english:'Georgia'},DE:{chinese:'德國',english:'Germany'},GH:{chinese:'加納',english:'Ghana'},GR:{chinese:'希臘',english:'Greece'},GL:{chinese:'格陵蘭',english:'Greenland'},GT:{chinese:'危地馬拉',english:'Guatemala'},GN:{chinese:'幾內亞',english:'Guinea'},GY:{chinese:'圭亞那',english:'Guyana'},HT:{chinese:'海地',english:'Haiti'},HN:{chinese:'洪都拉斯',english:'Honduras'},HK:{chinese:'香港',english:'Hong Kong'},HU:{chinese:'匈牙利',english:'Hungary'},IS:{chinese:'冰島',english:'Iceland'},IN:{chinese:'印度',english:'India'},ID:{chinese:'印度尼西亞',english:'Indonesia'},IR:{chinese:'伊朗',english:'Iran'},IQ:{chinese:'伊拉克',english:'Iraq'},IE:{chinese:'愛爾蘭',english:'Ireland'},IM:{chinese:'馬恩島',english:'Isle of Man'},IL:{chinese:'以色列',english:'Israel'},IT:{chinese:'意大利',english:'Italy'},CI:{chinese:'科特迪瓦',english:'Ivory Coast'},JM:{chinese:'牙買加',english:'Jamaica'},JP:{chinese:'日本',english:'Japan'},JO:{chinese:'約旦',english:'Jordan'},KZ:{chinese:'哈薩克斯坦',english:'Kazakstan'},KE:{chinese:'肯尼亞',english:'Kenya'},KR:{chinese:'韓國',english:'Korea'},KW:{chinese:'科威特',english:'Kuwait'},KG:{chinese:'吉爾吉斯斯坦',english:'Kyrgyzstan'},LA:{chinese:'老撾',english:'Laos'},LV:{chinese:'拉脫維亞',english:'Latvia'},LB:{chinese:'黎巴嫩',english:'Lebanon'},LS:{chinese:'萊索托',english:'Lesotho'},LR:{chinese:'利比里亞',english:'Liberia'},LY:{chinese:'利比亞',english:'Libya'},LT:{chinese:'立陶宛',english:'Lithuania'},LU:{chinese:'盧森堡',english:'Luxembourg'},MO:{chinese:'澳門',english:'Macao'},MK:{chinese:'馬其頓',english:'Macedonia'},MG:{chinese:'馬達加斯加',english:'Madagascar'},MW:{chinese:'馬拉維',english:'Malawi'},MY:{chinese:'馬來西亞',english:'Malaysia'},MV:{chinese:'馬爾代夫',english:'Maldives'},ML:{chinese:'馬里',english:'Mali'},MT:{chinese:'馬耳他',english:'Malta'},MR:{chinese:'毛利塔尼亞',english:'Mauritania'},MU:{chinese:'毛里求斯',english:'Mauritius'},MX:{chinese:'墨西哥',english:'Mexico'},MD:{chinese:'摩爾多瓦',english:'Moldova'},MC:{chinese:'摩納哥',english:'Monaco'},MN:{chinese:'蒙古',english:'Mongolia'},ME:{chinese:'黑山',english:'Montenegro'},MA:{chinese:'摩洛哥',english:'Morocco'},MZ:{chinese:'莫桑比克',english:'Mozambique'},MM:{chinese:'緬甸',english:'Myanmar'},NA:{chinese:'納米比亞',english:'Namibia'},NP:{chinese:'尼泊爾',english:'Nepal'},NL:{chinese:'荷蘭',english:'Netherlands'},NZ:{chinese:'新西蘭',english:'New Zealand'},NI:{chinese:'尼加拉瓜',english:'Nicaragua'},NE:{chinese:'尼日爾',english:'Niger'},NG:{chinese:'尼日利亞',english:'Nigeria'},KP:{chinese:'朝鮮',english:'North Korea'},NO:{chinese:'挪威',english:'Norway'},OM:{chinese:'阿曼',english:'Oman'},PK:{chinese:'巴基斯坦',english:'Pakistan'},PA:{chinese:'巴拿馬',english:'Panama'},PY:{chinese:'巴拉圭',english:'Paraguay'},PE:{chinese:'秘魯',english:'Peru'},PH:{chinese:'菲律賓',english:'Philippines'},PL:{chinese:'波蘭',english:'Poland'},PT:{chinese:'葡萄牙',english:'Portugal'},PR:{chinese:'波多黎各',english:'Puerto Rico'},QA:{chinese:'卡塔爾',english:'Qatar'},RE:{chinese:'留尼旺',english:'Reunion'},RO:{chinese:'羅馬尼亞',english:'Romania'},RU:{chinese:'俄羅斯',english:'Russia'},RW:{chinese:'盧旺達',english:'Rwanda'},SM:{chinese:'聖馬力諾',english:'San Marino'},SA:{chinese:'沙特阿拉伯',english:'Saudi Arabia'},SN:{chinese:'塞內加爾',english:'Senegal'},RS:{chinese:'塞爾維亞',english:'Serbia'},SL:{chinese:'塞拉利昂',english:'Sierra Leone'},SG:{chinese:'新加坡',english:'Singapore'},SK:{chinese:'斯洛伐克',english:'Slovakia'},SI:{chinese:'斯洛文尼亞',english:'Slovenia'},SO:{chinese:'索馬里',english:'Somalia'},ZA:{chinese:'南非',english:'South Africa'},ES:{chinese:'西班牙',english:'Spain'},LK:{chinese:'斯里蘭卡',english:'Sri Lanka'},SD:{chinese:'蘇丹',english:'Sudan'},SR:{chinese:'蘇里南',english:'Suriname'},SZ:{chinese:'斯威士蘭',english:'Swaziland'},SE:{chinese:'瑞典',english:'Sweden'},CH:{chinese:'瑞士',english:'Switzerland'},SY:{chinese:'敘利亞',english:'Syria'},TW:{chinese:'台灣',english:'Taiwan'},TJ:{chinese:'塔吉克斯坦',english:'Tajikstan'},TZ:{chinese:'坦桑尼亞',english:'Tanzania'},TH:{chinese:'泰國',english:'Thailand'},TG:{chinese:'多哥',english:'Togo'},TO:{chinese:'湯加',english:'Tonga'},TT:{chinese:'特立尼達和多巴哥',english:'Trinidad and Tobago'},TN:{chinese:'突尼斯',english:'Tunisia'},TR:{chinese:'土耳其',english:'Turkey'},TM:{chinese:'土庫曼斯坦',english:'Turkmenistan'},VI:{chinese:'美屬維爾京群島',english:'U.S. Virgin Islands'},UG:{chinese:'烏幹達',english:'Uganda'},UA:{chinese:'烏克蘭',english:'Ukraine'},AE:{chinese:'阿聯酋',english:'United Arab Emirates'},GB:{chinese:'英國',english:'United Kiongdom'},US:{chinese:'美國',english:'USA'},UY:{chinese:'烏拉圭',english:'Uruguay'},UZ:{chinese:'烏茲別克斯坦',english:'Uzbekistan'},VA:{chinese:'梵蒂岡',english:'Vatican City'},VE:{chinese:'委內瑞拉',english:'Venezuela'},VN:{chinese:'越南',english:'Vietnam'},YE:{chinese:'也門',english:'Yemen'},YU:{chinese:'南斯拉夫',english:'Yugoslavia'},ZR:{chinese:'紮伊爾',english:'Zaire'},ZM:{chinese:'讚比亞',english:'Zambia'},ZW:{chinese:'津巴布韋',english:'Zimbabwe'}}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),n={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(n,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){if(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:i,statusCode:r,headers:o,rawBody:h}=t;e(null,{status:i,statusCode:r,headers:o,rawBody:h},s.decode(h,this.encoding))},t=>{const{message:i,response:r}=t;e(i,r,r&&s.decode(r.rawBody,this.encoding))})}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){let i=require("iconv-lite");this.initGotEnv(t);const{url:r,...o}=t;this.got[s](r,o).then(t=>{const{statusCode:s,statusCode:r,headers:o,rawBody:h}=t;e(null,{status:s,statusCode:r,headers:o,rawBody:h},i.decode(h,this.encoding))},t=>{const{message:s,response:r}=t;e(s,r,r&&i.decode(r.rawBody,this.encoding))})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}