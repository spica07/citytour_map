/* 지역별 요약 리포트 */
(function () {
  'use strict';

  var CITYTOUR = window.CITYTOUR || [];
  var CITYTOUR_META = window.CITYTOUR_META || {};
  var CITYTOUR_SIDOS = window.CITYTOUR_SIDOS || [];

  var METHOD_ORDER = ['고정형', '순환형'];
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function count(list, pred) {
    return list.filter(pred).length;
  }
  function allCourses() {
    var out = [];
    CITYTOUR.forEach(function (m) { out = out.concat(m.courses); });
    return out;
  }

  /* ---------- 핵심 지표 타일 ---------- */
  var tiles = [
    { num: CITYTOUR_META.total || CITYTOUR.length, lbl: '탑승장' },
    { num: CITYTOUR_META.totalCourses || 0, lbl: '코스' },
    { num: CITYTOUR_META.geoApproxCount || 0, lbl: '근사 좌표' },
    { num: CITYTOUR_META.skippedCount || 0, lbl: '좌표 없어 제외' }
  ];
  document.getElementById('statTiles').innerHTML = tiles.map(function (t) {
    return '<div class="stat-tile"><div class="num">' + t.num + '</div><div class="lbl">' + t.lbl + '</div></div>';
  }).join('');

  /* ---------- 운행방식 분포 ---------- */
  var methodCounts = {};
  allCourses().forEach(function (c) {
    methodCounts[c.method] = (methodCounts[c.method] || 0) + 1;
  });
  document.getElementById('methodChips').innerHTML = METHOD_ORDER
    .filter(function (t) { return methodCounts[t]; })
    .map(function (t) {
      return '<span class="status-chip"><span class="tag">' + esc(t) + '</span>' +
        '<span class="chip-num">코스 ' + methodCounts[t] + '개</span></span>';
    }).join('');

  /* ---------- 지역별 막대 차트 ---------- */
  var bySido = {};
  CITYTOUR.forEach(function (m) {
    (bySido[m.sido] = bySido[m.sido] || []).push(m);
  });
  var entries = CITYTOUR_SIDOS
    .filter(function (s) { return bySido[s]; })
    .map(function (s) { return [s, bySido[s].length]; });
  entries.sort(function (a, b) { return b[1] - a[1]; });
  var max = entries.length ? entries[0][1] : 1;
  document.getElementById('sidoBars').innerHTML = entries.map(function (e) {
    return (
      '<button class="dbar" data-sido="' + esc(e[0]) + '" title="지도에서 ' + esc(e[0]) + ' 보기">' +
        '<span>' + esc(e[0]) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + (e[1] / max * 100) + '%"></span></span>' +
        '<span class="cnt">' + e[1] + '</span>' +
      '</button>'
    );
  }).join('');

  document.getElementById('sidoBars').addEventListener('click', function (e) {
    var dbar = e.target.closest('.dbar');
    if (dbar) {
      location.href = 'index.html?sido=' + encodeURIComponent(dbar.getAttribute('data-sido'));
    }
  });

  /* ---------- 지역별 상세 표 ---------- */
  var tbody = document.querySelector('#reportTable tbody');
  tbody.innerHTML = entries.map(function (e) {
    var s = e[0], list = bySido[s];
    var courses = [];
    list.forEach(function (m) { courses = courses.concat(m.courses); });
    return (
      '<tr>' +
        '<td>' + esc(s) + '</td>' +
        '<td>' + list.length + '</td>' +
        '<td>' + courses.length + '</td>' +
        '<td>' + count(list, function (m) { return m.courses.some(function (c) { return c.feeFree; }); }) + '</td>' +
        '<td>' + count(list, function (m) { return m.geoApprox; }) + '</td>' +
        '<td>' + count(courses, function (c) { return c.method === '고정형'; }) + '</td>' +
        '<td>' + count(courses, function (c) { return c.method === '순환형'; }) + '</td>' +
      '</tr>'
    );
  }).join('');

  /* ---------- 헤더 ---------- */
  document.getElementById('totalCount').textContent = CITYTOUR_META.total || CITYTOUR.length;
  document.getElementById('totalCourses').textContent = CITYTOUR_META.totalCourses || '';
  document.getElementById('surveyDate').textContent = CITYTOUR_META.surveyDate || '';

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();
