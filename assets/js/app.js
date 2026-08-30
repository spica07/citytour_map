/* 전국 시티투어 지도 — 앱 로직 */
(function () {
  'use strict';

  var CITYTOUR = window.CITYTOUR || [];
  var CITYTOUR_META = window.CITYTOUR_META || {};
  var CITYTOUR_SIDOS = window.CITYTOUR_SIDOS || [];
  var METHOD_ORDER = ['고정형', '순환형'];

  var state = {
    q: '',
    sido: '',
    district: '',   // "시도|시군구" 복합 키
    method: '',
    freeOnly: false,
    view: 'list'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u == null ? '' : u)) ? String(u) : '';
  }
  function districtKey(m) { return m.sido + '|' + m.sigungu; }

  /* ---------- 필터링 ---------- */
  function matches(m) {
    if (state.sido && m.sido !== state.sido) return false;
    if (state.district && districtKey(m) !== state.district) return false;
    if (state.method && !m.courses.some(function (c) { return c.method === state.method; })) return false;
    if (state.freeOnly && !m.courses.some(function (c) { return c.feeFree; })) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = [m.place, m.sigungu, m.sido].concat(m.courses.map(function (c) { return c.name; }))
        .join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* ---------- 지도 ---------- */
  var DEFAULT_VIEW = { center: [36.30, 127.80], zoom: 7 };
  var map = L.map('map', { zoomControl: true, renderer: L.canvas() })
    .setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  /* ---------- 독도 ---------- */
  // 배경 지도 표기는 축척·언어에 따라 달라지거나 빠질 수 있다.
  // 우리 지도에서는 독도를 항상 같은 자리에 직접 그린다. (독도 표시)
  // 행정구역: 경상북도 울릉군 울릉읍 독도리
  (function markDokdo() {
    var dokdo = L.circleMarker([37.2429, 131.8664], {
      radius: 5,
      color: '#2f2e2b',
      weight: 1.6,
      fillColor: '#ffffff',
      fillOpacity: 1
    }).addTo(map);
    dokdo.bindTooltip('독도', {
      permanent: true,
      direction: 'right',
      offset: [6, 0],
      className: 'dokdo-label'
    });
    dokdo.bindPopup('<b>독도</b><br>경상북도 울릉군 울릉읍 독도리');
  })();

  var markerLayer = L.layerGroup().addTo(map);
  var markersById = {};

  function renderMarkers(list) {
    markerLayer.clearLayers();
    markersById = {};
    list.forEach(function (m) {
      var hasFree = m.courses.some(function (c) { return c.feeFree; });
      var marker = L.circleMarker([m.lat, m.lng], {
        radius: 8,
        fillColor: hasFree ? '#176B5B' : '#2F6690',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.9
      });
      var popupHtml =
        '<div class="popup-name">' + esc(m.place) + '</div>' +
        '<div class="popup-meta">' + esc(m.sido) + ' ' + esc(m.sigungu) + ' · 코스 ' + m.courses.length + '개' +
        (m.geoApprox ? ' · 위치 근사치' : '') + '</div>' +
        '<button class="popup-btn" data-popup-detail="' + m.id + '">자세히 보기</button>';
      marker.bindPopup(popupHtml);
      marker.addTo(markerLayer);
      markersById[m.id] = marker;
    });
  }

  /* ---------- 카드에서 지도 위치로 이동 ---------- */
  function locateOnMap(id) {
    var m = CITYTOUR.find(function (x) { return x.id === id; });
    if (!m) return;
    if (window.innerWidth <= 900 && state.view !== 'map') {
      state.view = 'map';
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-view') === 'map');
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-list');
      grid.classList.add('view-map');
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
    map.flyTo([m.lat, m.lng], 14, { duration: 0.8 });
    var marker = markersById[m.id];
    if (marker) map.once('moveend', function () { marker.openPopup(); });
  }

  /* ---------- 카드 ---------- */
  function cardHtml(m) {
    var hasFree = m.courses.some(function (c) { return c.feeFree; });
    var tags = [
      nearby.tag(m),
      '<span class="tag district">' + esc(m.sido) + ' ' + esc(m.sigungu) + '</span>',
      '<span class="tag">코스 ' + m.courses.length + '개</span>'
    ];
    if (hasFree) tags.push('<span class="tag free">무료 코스 있음</span>');
    if (m.geoApprox) tags.push('<span class="tag approx">위치 근사치</span>');
    return (
      '<article class="facility-card" data-id="' + m.id + '">' +
        '<div class="card-body">' +
          '<div class="card-title-row">' +
            '<h3 class="card-name">' + esc(m.place) + '</h3>' +
          '</div>' +
          '<div class="card-tags">' + tags.join('') + '</div>' +
          '<button class="card-locate" data-locate="' + m.id + '">위치보기</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderCards(list) {
    var grid = document.getElementById('cardGrid');
    grid.innerHTML = list.map(cardHtml).join('');
    document.getElementById('emptyState').hidden = list.length > 0;
  }

  /* ---------- 상세 모달 ---------- */
  function detailRow(k, v, isLink) {
    if (!v) return '';
    var val = isLink
      ? (safeUrl(v) ? '<a href="' + esc(safeUrl(v)) + '" target="_blank" rel="noopener">' + esc(v) + '</a>' : esc(v))
      : esc(v);
    return '<div class="detail-item"><span class="k">' + k + '</span><span class="v">' + val + '</span></div>';
  }

  function courseHtml(c) {
    var feeText = c.feeFree ? '무료' : (c.fee || '');
    return (
      '<div class="course-block">' +
        '<h4 class="course-name">' + esc(c.name) + '</h4>' +
        '<div class="detail-list">' +
          detailRow('운행방식', c.method) +
          detailRow('운영시간', c.hours) +
          detailRow('운행정보', c.operInfo) +
          detailRow('운행시각', (c.opStart || c.opEnd) ? (esc(c.opStart) + ' ~ ' + esc(c.opEnd)) : '') +
          detailRow('배차시간', c.interval) +
          detailRow('이용요금', feeText) +
          detailRow('요금 참고', c.feeEtc) +
          detailRow('코스', c.courseInfo) +
          detailRow('경유지 주변 관광정보', c.aroundInfo) +
          detailRow('홈페이지', c.homepage, true) +
          detailRow('문의처', c.contact) +
          detailRow('관리기관', c.org) +
          detailRow('관리기관 전화', c.orgPhone) +
          detailRow('자료 기준일', c.refDate) +
        '</div>' +
      '</div>'
    );
  }

  window.openMarkerModal = function (id) {
    var m = CITYTOUR.find(function (x) { return x.id === id; });
    if (!m) return;
    var naverUrl = 'https://map.naver.com/p/search/' +
      encodeURIComponent(m.sido + ' ' + m.sigungu + ' ' + m.place);
    var body = document.getElementById('modalBody');
    body.innerHTML =
      '<h2 class="modal-title">' + esc(m.place) + '</h2>' +
      '<div class="modal-tags">' +
        '<span class="tag district">' + esc(m.sido) + ' ' + esc(m.sigungu) + '</span>' +
        (m.geoApprox ? '<span class="tag approx">위치 근사치 — 정확한 탑승 위치는 문의처에 확인하세요</span>' : '') +
      '</div>' +
      '<div class="detail-list">' +
        detailRow('내 위치에서', nearby.text(m)) +
      '</div>' +
      m.courses.map(courseHtml).join('') +
      '<div class="modal-links">' +
        '<a class="link-btn map" href="' + naverUrl + '" target="_blank" rel="noopener">네이버 길찾기</a>' +
      '</div>';
    document.getElementById('modalOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  };

  function closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 렌더 파이프라인 ---------- */
  function render() {
    var list = nearby.sort(CITYTOUR.filter(matches));
    renderMarkers(list);
    renderCards(list);
    document.getElementById('resultCount').textContent = nearby.active()
      ? '가까운 ' + list.length + '곳'
      : '총 ' + list.length + '곳' + (list.length < CITYTOUR.length ? ' (전체 ' + CITYTOUR.length + '곳 중)' : '');
  }

  /* ---------- 내 주변 ----------
     권한 요청·거리 계산·내 위치 마커는 geo.js 가 맡는다. 이 앱이 알려줄 것은
     좌표를 꺼내는 법과, 지역 필터를 어떻게 푸는지뿐이다. */
  function clearRegion() {
    state.sido = '';
    state.district = '';
    document.getElementById('districtSelect').value = '';
    document.querySelectorAll('#sidoFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-sido') === '');
    });
  }

  var nearby = window.createNearby({
    map: map,
    button: document.getElementById('nearbyBtn'),
    label: document.getElementById('nearbyLabel'),
    notice: document.getElementById('nearbyNotice'),
    unitLabel: '탑승장',
    latLngOf: function (m) { return [m.lat, m.lng]; },
    onClear: clearRegion,
    onChange: render
  });

  /* ---------- 초기 UI 구성 ---------- */
  function buildFilterPills() {
    var sidoRow = document.getElementById('sidoFilters');
    var sPills = ['<button class="pill active" data-sido="">전체</button>'];
    CITYTOUR_SIDOS.forEach(function (s) {
      sPills.push('<button class="pill" data-sido="' + esc(s) + '">' + esc(s) + '</button>');
    });
    sidoRow.insertAdjacentHTML('beforeend', sPills.join(''));

    var methodRow = document.getElementById('methodFilters');
    var mPills = ['<button class="pill active" data-method="">전체</button>'];
    METHOD_ORDER.forEach(function (t) {
      mPills.push('<button class="pill" data-method="' + t + '">' + t + '</button>');
    });
    methodRow.insertAdjacentHTML('beforeend', mPills.join(''));
  }

  function buildDistrictSelect() {
    var sel = document.getElementById('districtSelect');
    var bySido = {};
    CITYTOUR.forEach(function (m) {
      if (!bySido[m.sido]) bySido[m.sido] = {};
      bySido[m.sido][m.sigungu] = (bySido[m.sido][m.sigungu] || 0) + 1;
    });
    CITYTOUR_SIDOS.forEach(function (s) {
      if (!bySido[s]) return;
      var group = document.createElement('optgroup');
      group.label = s;
      Object.keys(bySido[s]).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
        .forEach(function (d) {
          var opt = document.createElement('option');
          opt.value = s + '|' + d;
          opt.textContent = s + ' ' + d + ' (' + bySido[s][d] + ')';
          group.appendChild(opt);
        });
      sel.appendChild(group);
    });
  }

  /* ---------- 이벤트 ---------- */
  function setDistrict(key) {
    nearby.off();
    state.district = key;
    document.getElementById('districtSelect').value = key;
    if (key) {
      var parts = key.split('|');
      var sub = CITYTOUR.filter(function (m) { return m.sido === parts[0] && m.sigungu === parts[1]; });
      if (sub.length) {
        var bounds = L.latLngBounds(sub.map(function (m) { return [m.lat, m.lng]; }));
        map.flyToBounds(bounds.pad(0.3), { duration: 0.8 });
      }
    } else {
      map.flyTo(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom, { duration: 0.8 });
    }
    render();
  }

  function setSido(s) {
    nearby.off();   /* 지역을 고르는 건 내 주변을 그만두겠다는 뜻이다 */
    state.sido = s;
    if (state.district && s && state.district.split('|')[0] !== s) {
      state.district = '';
      document.getElementById('districtSelect').value = '';
    }
    document.querySelectorAll('#sidoFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-sido') === s);
    });
    if (!state.district) {
      var sub = CITYTOUR.filter(function (m) { return !s || m.sido === s; });
      if (sub.length) {
        var bounds = L.latLngBounds(sub.map(function (m) { return [m.lat, m.lng]; }));
        map.flyToBounds(bounds.pad(0.2), { duration: 0.8 });
      }
    }
    render();
  }

  var searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = e.target.value.trim();
      render();
    }, 200);
  });

  document.getElementById('districtSelect').addEventListener('change', function (e) {
    setDistrict(e.target.value);
  });

  var filterToggleBtn = document.getElementById('filterToggleBtn');
  var filterGroups = document.getElementById('filterGroups');
  filterToggleBtn.addEventListener('click', function () {
    var willOpen = filterGroups.hidden;
    filterGroups.hidden = !willOpen;
    var label = willOpen ? '필터 닫기' : '필터 열기';
    filterToggleBtn.title = label;
    filterToggleBtn.setAttribute('aria-label', label);
    filterToggleBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('click', function (e) {
    var t = e.target;

    var locateBtn = t.closest('[data-locate]');
    if (locateBtn) {
      e.stopPropagation();
      locateOnMap(Number(locateBtn.getAttribute('data-locate')));
      return;
    }

    var popupBtn = t.closest('[data-popup-detail]');
    if (popupBtn) {
      window.openMarkerModal(Number(popupBtn.getAttribute('data-popup-detail')));
      return;
    }

    var sidoPill = t.closest('[data-sido]');
    if (sidoPill) {
      setSido(sidoPill.getAttribute('data-sido'));
      return;
    }

    var methodPill = t.closest('[data-method]');
    if (methodPill) {
      state.method = methodPill.getAttribute('data-method');
      document.querySelectorAll('#methodFilters .pill').forEach(function (p) {
        p.classList.toggle('active', p === methodPill);
      });
      render();
      return;
    }

    var togglePill = t.closest('[data-toggle]');
    if (togglePill) {
      var key = togglePill.getAttribute('data-toggle');
      state[key] = !state[key];
      document.querySelectorAll('[data-toggle="' + key + '"]').forEach(function (p) {
        p.classList.toggle('active', state[key]);
      });
      render();
      return;
    }

    var viewBtn = t.closest('[data-view]');
    if (viewBtn) {
      state.view = viewBtn.getAttribute('data-view');
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p === viewBtn);
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-map', 'view-list');
      grid.classList.add('view-' + state.view);
      if (state.view === 'map') setTimeout(function () { map.invalidateSize(); }, 50);
      return;
    }

    var card = t.closest('.facility-card');
    if (card) {
      window.openMarkerModal(Number(card.getAttribute('data-id')));
      return;
    }

    if (t.id === 'modalClose' || t.id === 'modalOverlay') closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('resetBtn').addEventListener('click', function () {
    state.q = ''; state.method = ''; state.freeOnly = false;
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-groups .pill').forEach(function (p) {
      p.classList.toggle('active',
        p.getAttribute('data-sido') === '' || p.getAttribute('data-method') === '');
    });
    document.querySelectorAll('[data-toggle]').forEach(function (p) { p.classList.remove('active'); });
    setSido('');
    setDistrict('');
  });

  /* ---------- 시작 ---------- */
  document.getElementById('surveyDate').textContent = CITYTOUR_META.surveyDate || '';
  document.getElementById('totalCount').textContent = CITYTOUR.length;
  document.getElementById('totalCourses').textContent = CITYTOUR_META.totalCourses || '';
  buildFilterPills();
  buildDistrictSelect();
  if (window.innerWidth <= 900) {
    document.querySelector('.content-grid').classList.add('view-list');
  }
  var params = new URLSearchParams(location.search);
  var paramDistrict = params.get('district');
  var paramSido = params.get('sido');
  if (paramDistrict && paramDistrict.indexOf('|') !== -1) {
    setDistrict(paramDistrict);
  } else if (paramSido && CITYTOUR_SIDOS.indexOf(paramSido) !== -1) {
    setSido(paramSido);
  } else {
    render();
  }

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();
