// ==UserScript==
// @name         Fanbox Batch Downloader
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Batch Download on creator, not post
// @author       https://github.com/amarillys
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.2.2/jszip.min.js
// @match        https://www.pixiv.net/fanbox/creator/*
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

/**
 * Github:　https://github.com/Amarillys/FanboxBatchDownloader
 * Update Log
 *  > 191223
 *    Add support of files
 *    Change Download Request as await, for avoiding delaying.
 *    Add manual package while click button use middle button of mouse
 *    // 中文注释
 *    增加对附件下载的支持
 *    修改下载方式为按顺序下载，避免超时
 *    增加当鼠标中键点击时手动打包
 *  */


(function () {
  'use strict';

  let zip = new JSZip()
  const fetchOptions = {
    credentials: 'include',
    headers: {
      Accept: 'application/json, text/plain, */*'
    }
  }

  window.onload = () => {
    let baseBtn = document.querySelector('[href="/fanbox/notification"]')
    let className = baseBtn.parentNode.className
    let parent = baseBtn.parentNode.parentNode
    let downloadBtn = document.createElement('div')
    downloadBtn.className = className
    downloadBtn.innerHTML = `
          <a href="javascript:void(0)">
              <div id="amarillys-download-progress"
                  style="line-height: 32px;width: 100px;height: 32px;background-color: rgba(232, 12, 2, 0.96);;border-radius: 8px;color: #FFF;text-align: center;">
                      Download/下载
              </div>
          </a>`
    downloadBtn.addEventListener('mousedown', event => {
      let creatorId = parseInt(document.URL.split('/')[5])
      if (event.button === 1) {
        zip.generateAsync({
          type: 'blob'
        }).then(zipBlob => saveBlob(zipBlob, `${creatorId}.zip`))
      } else {
        console.log('startDownloading');
        downloadByFanboxId(creatorId);
      }
    })
    parent.appendChild(downloadBtn)
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

  async function downloadByFanboxId(creatorId) {
    let textDiv = document.querySelector('#amarillys-download-progress')
    textDiv.innerHTML = ` ...... `
    let creatorInfo = await getAllPostsByFanboxId(creatorId)
    let amount = 0
    let processed = 0
    let waittime = 0
    zip.file('cover.jpg', await gmRequireImage(creatorInfo.cover), {
      compression: "STORE"
    })

    // count files amount
    for (let i = 0, p = creatorInfo.posts; i < p.length; ++i) {
      if (!p[i].body) continue
      let { files, images } = p[i].body
      amount += files ? files.length : 0
      amount += images ? images.length : 0
    }
    textDiv.innerHTML = ` ${ processed } / ${ amount } `

    // start downloading
    for (let i = 0, p = creatorInfo.posts; i < p.length; ++i) {
      let folder = `${p[i].title}-${p[i].id}`
      if (!p[i].body) continue
      let { files, images } = p[i].body
      if (files) {
        for (let j = 0; j < files.length; ++j) {
          let extension = files[j].url.slice(-3)
          let blob = await gmRequireImage(files[j].url)
          zip.folder(folder).file(`${folder}_${j}.${extension}`, blob, {
            compression: "STORE"
          })
          waittime--
          processed++
          textDiv.innerHTML = ` ${ processed } / ${ amount } `
          console.log(` Progress: ${ processed } / ${ amount }`)
        }
      }
      if (images) {
        for (let j = 0; j < images.length; ++j) {
          let extension = images[j].extension === 'jpeg' ? 'jpg' : 'png'
          textDiv.innerHTML = ` ${ processed } / ${ amount } `
          let blob = await gmRequireImage(images[j].originalUrl)
          zip.folder(folder).file(`${folder}_${j}.${extension}`, blob, {
            compression: "STORE"
          })
          waittime--
          processed++
          textDiv.innerHTML = ` ${ processed } / ${ amount } `
          console.log(` Progress: ${ processed } / ${ amount }`)
        }
      }
    }
    // generate zip to download
    let timer = setInterval(() => {
      waittime++
      if (amount === processed || waittime > 300) {
        zip.generateAsync({
          type: 'blob'
        }).then(zipBlob => saveBlob(zipBlob, `${creatorId}.zip`))
        clearInterval(timer)
      }
    }, 1000)
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
    downloadDom.id = 'fuck'
    document.body.appendChild(downloadDom)
    downloadDom.style = `display: none`
    let url = window.URL.createObjectURL(blob)
    downloadDom.href = url
    downloadDom.download = fileName
    downloadDom.click()
    window.URL.revokeObjectURL(url)
  }
})();
