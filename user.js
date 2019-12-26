// ==UserScript==
// @name         Fanbox Batch Downloader
// @namespace    http://tampermonkey.net/
// @version      0.40
// @description  Batch Download on creator, not post
// @author       https://github.com/amarillys
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.2.2/jszip.min.js
// @match        https://www.pixiv.net/fanbox/creator/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// @license      MIT
// ==/UserScript==

/**
 * Update Log
 *  > 191226
 *    Support downloading by batch(default: 100 files per batch)
 *    // 中文注释
 *    新增支持分批下载的功能（默认100个文件一个批次）
 *
 *  > 191223
 *    Add support of files
 *    Improve the detect of file extension
 *    Change Download Request as await, for avoiding delaying.
 *    Add manual package while click button use middle button of mouse
 *    // 中文注释
 *    增加对附件下载的支持
 *    优化文件后缀名识别
 *    修改下载方式为按顺序下载，避免超时
 *    增加当鼠标中键点击时手动打包
 *  */


(function () {
  'use strict';

  let zip = new JSZip()
  let amount = 0
  let uiInited = false
  const fetchOptions = {
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/plain, */*'
    }
  }

  let init = async () => {
    let baseBtn = document.querySelector('[href="/fanbox/notification"]')
    let className = baseBtn.parentNode.className
    let parent = baseBtn.parentNode.parentNode
    let inputDiv = document.createElement('div')
    let creatorId = parseInt(document.URL.split('/')[5])
    inputDiv.innerHTML = `
      <input id="dlStart" style="width: 3rem" type="text" value="1"> -> <input id="dlEnd" style="width: 3rem" type="text">
       / 分批/Batch: <input id="dlStep" style="width: 3rem" type="text" value="100">`
    parent.appendChild(inputDiv)

    let downloadBtn = document.createElement('div')
    downloadBtn.id = 'FanboxDownloadBtn'
    downloadBtn.className = className
    downloadBtn.innerHTML = `
      <a href="javascript:void(0)">
          <div id="amarillys-download-progress"
              style="line-height: 32px;width: 100px;height: 32px;background-color: rgba(232, 12, 2, 0.96);;border-radius: 8px;color: #FFF;text-align: center;">
                  Download/下载
          </div>
      </a>`
    parent.appendChild(downloadBtn)
    uiInited = true

    let creatorInfo = await getAllPostsByFanboxId(creatorId)
    // count files amount
    for (let i = 0, p = creatorInfo.posts; i < p.length; ++i) {
      if (!p[i].body) continue
      let { images } = p[i].body
      amount += images ? images.length : 0
    }
    document.querySelector('#dlEnd').value = amount

    downloadBtn.addEventListener('mousedown', event => {
      if (event.button === 1) {
        zip.generateAsync({
          type: 'blob'
        }).then(zipBlob => saveBlob(zipBlob, `${creatorId}.zip`))
      } else {
        console.log('startDownloading');
        downloadByFanboxId(creatorInfo, creatorId);
      }
    })
  }

  window.onload = () => {
    init()
    let timer = setInterval(() => {
      if (!uiInited && document.querySelector('#FanboxDownloadBtn') === null)
        init()
      else
        clearInterval(timer)
    }, 3000)
  }

  function gmRequireImage(url) {
    return new Promise(resolve => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        onload: res => {
          resolve(res.response)
        }
      })
    })
  }

  async function downloadByFanboxId(creatorInfo, creatorId) {
    let processed = 0
    let stepped = 0
    let STEP = parseInt(document.querySelector('#dlStep').value)
    let textDiv = document.querySelector('#amarillys-download-progress')
    zip.file('cover.jpg', await gmRequireImage(creatorInfo.cover), {
      compression: "STORE"
    })

    // start downloading
    for (let i = 0, p = creatorInfo.posts; i < p.length; ++i) {
      let folder = `${p[i].title}-${p[i].id}`
      if (!p[i].body) continue
      let { files, images } = p[i].body
      if (files) {
        for (let j = 0; j < files.length; ++j) {
          let extension = files[j].url.split('.').slice(-1)[0]
          let blob = await gmRequireImage(files[j].url)
          saveBlob(blob, `${creatorId} - ${folder}_${j}.${extension}`)
          textDiv.innerHTML = ` ${ processed } / ${ amount } `
          console.log(` Progress: ${ processed } / ${ amount }`)
        }
      }
      if (images) {
        for (let j = 0; j < images.length; ++j) {
          let extension = images[j].originalUrl.split('.').slice(-1)[0]
          textDiv.innerHTML = ` ${ processed } / ${ amount } `
          let blob = await gmRequireImage(images[j].originalUrl)
          zip.folder(folder).file(`${folder}_${j}.${extension}`, blob, {
            compression: "STORE"
          })
          stepped++
          processed++
          textDiv.innerHTML = ` ${ processed } / ${ amount } `
          console.log(` Progress: ${ processed } / ${ amount }`)
          if (amount === processed) {
            zip.generateAsync({
              type: 'blob'
            }).then(zipBlob => {
              saveBlob(zipBlob, `${creatorId}-${amount - stepped}-${amount}.zip`)
              textDiv.innerHTML = ` Okayed/完成 `
            })
          } else {
            if (stepped >= STEP) {
              let start = amount - stepped
              zip.generateAsync({
                type: 'blob'
              }).then(zipBlob => {
                saveBlob(zipBlob, `${creatorId}-${start}-${processed}.zip`)
              })
              zip = new JSZip()
              stepped = 0
            }
          }
        }
      }
    }
  }

  async function getAllPostsByFanboxId(creatorId) {
    let fristUrl = `https://www.pixiv.net/ajax/fanbox/creator?userId=${ creatorId }`
    let creatorInfo = {
      cover: null,
      posts: []
    }
    let firstData = await (await fetch(fristUrl, fetchOptions)).json()
    let body = firstData.body
    creatorInfo.cover = body.creator.coverImageUrl
    creatorInfo.posts.push(...body.post.items)
    let nextPageUrl = body.post.nextUrl
    while (nextPageUrl) {
      let nextData = await (await fetch(nextPageUrl, fetchOptions)).json()
      creatorInfo.posts.push(...nextData.body.items)
      nextPageUrl = nextData.body.nextUrl
    }
    return creatorInfo
  }

  function saveBlob(blob, fileName) {
    let downloadDom = document.createElement('a')
    document.body.appendChild(downloadDom)
    downloadDom.style = `display: none`
    let url = window.URL.createObjectURL(blob)
    downloadDom.href = url
    downloadDom.download = fileName
    downloadDom.click()
    window.URL.revokeObjectURL(url)
  }
})();
