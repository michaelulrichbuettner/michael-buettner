(function () {
  const root = document.querySelector('[data-event-map]');
  const status = document.querySelector('[data-event-map-status]');
  const list = document.querySelector('[data-event-location-list]');
  if (!root || !status || !list) return;
  const NS = 'http://www.w3.org/2000/svg';
  const MAX_ZOOM = 24;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const dateFormat = new Intl.DateTimeFormat('de-DE', {day:'2-digit', month:'long', year:'numeric'});
  function svgNode(tag, attributes = {}, parent) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (parent) parent.append(node);
    return node;
  }

  async function initialize() {
    if (!window.d3?.geoAzimuthalEqualArea || !window.topojson) throw new Error('Die Kartenbibliothek konnte nicht geladen werden.');
    const responses = await Promise.all([
      fetch(root.dataset.source, {cache:'no-store'}), fetch(root.dataset.world, {cache:'force-cache'})
    ]);
    if (responses.some(response => !response.ok)) throw new Error('Die Kartendaten konnten nicht geladen werden.');
    const [payload, topology] = await Promise.all(responses.map(response => response.json()));
    const events = payload.events;
    if (!events?.length || !topology.objects?.countries) throw new Error('Die Kartendaten sind unvollständig.');
    const countries = topojson.feature(topology, topology.objects.countries);
    // Lambert azimuthal equal-area, north-polar aspect, clipped at the equator.
    const projection = d3.geoAzimuthalEqualArea().rotate([0, -90, 0]).clipAngle(90).precision(0.3);
    const path = d3.geoPath(projection);
    const locations = [];
    events.forEach(event => {
      let location = locations.find(item => item.latitude === event.latitude && item.longitude === event.longitude);
      if (!location) {
        location = {latitude:event.latitude, longitude:event.longitude, name:event.location, events:[]};
        locations.push(location);
      }
      location.events.push(event);
    });
    let width = 0, height = 0, selected = [], camera = {k:1,x:0,y:0}, frame = 0, drag = null;
    let returnFocus = null, returnEventId = null, suppressClick = false;
    root.classList.add('polar-map');
    root.innerHTML = `
      <div class="polar-map__controls" aria-label="Kartensteuerung">
        <button type="button" data-map-home>Gesamtansicht</button>
        <button type="button" data-map-out aria-label="Karte verkleinern">−</button>
        <button type="button" data-map-in aria-label="Karte vergrößern">+</button>
      </div>
      <p class="polar-map__caption">Nordhalbkugel · flächentreu</p>
      <section class="polar-map__panel" hidden aria-labelledby="event-detail-title">
        <header class="polar-map__panel-header">
          <div><p data-detail-location></p><h2 id="event-detail-title" tabindex="-1"></h2><span data-detail-count></span></div>
          <button type="button" data-map-close aria-label="Artikelfenster schließen und zur Gesamtansicht zurückkehren">×</button>
        </header>
        <div class="polar-map__articles" tabindex="0" aria-label="Artikelliste"></div>
      </section>`;
    const panel = root.querySelector('.polar-map__panel');
    const articleList = root.querySelector('.polar-map__articles');
    const home = root.querySelector('[data-map-home]');
    const zoomIn = root.querySelector('[data-map-in]');
    const zoomOut = root.querySelector('[data-map-out]');
    const svg = svgNode('svg', {class:'polar-map__svg',role:'group','aria-label':'Flächentreue Polaransicht der Nordhalbkugel. Punkte auswählen; freie Kartenfläche oder Escape führt zur Gesamtansicht.'});
    root.prepend(svg);
    const geography = svgNode('g', {'aria-hidden':'true',class:'polar-map__geography'}, svg);
    const ocean = svgNode('path', {class:'polar-map__ocean'}, geography);
    const land = svgNode('path', {class:'polar-map__land'}, geography);
    const grid = svgNode('path', {class:'polar-map__grid'}, geography);
    const pole = svgNode('text', {class:'polar-map__pole','text-anchor':'middle'}, svg);
    pole.textContent = 'NORDPOL';
    const markerLayer = svgNode('g', {class:'polar-map__markers'}, svg);
    const graticule = d3.geoGraticule().extent([[-180,0],[180,90]]).step([30,30])();

    function updateButtons() {
      home.disabled = camera.k === 1 && !selected.length && Math.abs(camera.x) < 0.1 && Math.abs(camera.y) < 0.1;
      zoomOut.disabled = camera.k <= 1;
      zoomIn.disabled = camera.k >= MAX_ZOOM;
      list.querySelectorAll('button').forEach(button => {
        const active = selected.some(event => event.id === button.dataset.eventId);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      root.dataset.zoom = camera.k.toFixed(3);
      root.dataset.view = selected.length ? 'event' : camera.k > 1 ? 'detail' : 'overview';
    }

    function screenPoint(location) {
      const point = projection([location.longitude, location.latitude]);
      return [point[0] * camera.k + camera.x, point[1] * camera.k + camera.y];
    }

    function renderMarkers() {
      const focused = document.activeElement?.dataset?.locationKey;
      markerLayer.replaceChildren();
      const groups = [];
      locations.forEach(location => {
        const [x,y] = screenPoint(location);
        if (x < -25 || x > width + 25 || y < -25 || y > height + 25) return;
        const active = location.events.some(event => selected.includes(event));
        // Keep the selected marker unobscured; nearby events remain available in the list.
        if (!active && selected.length && Math.hypot(...screenPoint(selected[0]).map((value,index)=>value-[x,y][index])) < 42) return;
        let group = groups.find(g => !g.active && !active && Math.hypot(g.x-x,g.y-y) < 42);
        if (!group) { group = {x,y,locations:[],active}; groups.push(group); }
        group.locations.push(location);
        group.x += (x-group.x)/group.locations.length;
        group.y += (y-group.y)/group.locations.length;
      });
      groups.forEach(group => {
        const groupedEvents = group.locations.flatMap(location => location.events);
        const count = groupedEvents.reduce((sum,event) => sum + event.articles.length, 0);
        const key = groupedEvents.map(event=>event.id).join(' ');
        const multiple = group.locations.length > 1;
        const label = `${multiple ? group.locations.length + ' Standorte: ' : ''}${groupedEvents.map(event=>event.name).join(', ')} · ${group.locations.map(location=>location.name).join('; ')} · ${count} Artikel${multiple ? ' – zum Vergrößern auswählen' : ''}`;
        const marker = svgNode('g', {class:`polar-map__marker${group.active?' is-active':''}${multiple?' is-cluster':''}`,transform:`translate(${group.x},${group.y})`,role:'button',tabindex:'0','aria-label':label,'aria-pressed':String(group.active),'data-location-key':key,'data-map-x':(group.x-camera.x)/camera.k,'data-map-y':(group.y-camera.y)/camera.k}, markerLayer);
        svgNode('title', {}, marker).textContent = label;
        svgNode('circle', {r:multiple?21:18}, marker);
        svgNode('text', {'text-anchor':'middle','dominant-baseline':'central'}, marker).textContent = count;
        function activate() {
          returnFocus = marker;
          returnEventId = groupedEvents[0].id;
          if (multiple) {
            hidePanel();
            const points = group.locations.map(location=>projection([location.longitude,location.latitude]));
            const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
            const k=Math.min(MAX_ZOOM, Math.max(camera.k*1.8, Math.min((width-100)/(Math.max(...xs)-Math.min(...xs)||1),(height-120)/(Math.max(...ys)-Math.min(...ys)||1))));
            moveTo({k,x:width/2-(Math.min(...xs)+Math.max(...xs))/2*k,y:height/2-(Math.min(...ys)+Math.max(...ys))/2*k});
            status.textContent = 'Standorte vergrößert. Event auswählen oder zur Gesamtansicht zurückkehren.';
          } else selectEvents(groupedEvents);
        }
        marker.addEventListener('click', event=>{event.stopPropagation(); if (!suppressClick) activate();});
        marker.addEventListener('keydown', event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});
      });
      if (focused) ([...markerLayer.children].find(node=>node.dataset.locationKey===focused) || markerLayer.firstElementChild)?.focus({preventScroll:true});
    }

    function draw(final = false) {
      geography.setAttribute('transform', `translate(${camera.x},${camera.y}) scale(${camera.k})`);
      const center = projection([0,90]);
      pole.setAttribute('x', center[0]*camera.k+camera.x);
      pole.setAttribute('y', center[1]*camera.k+camera.y-8);
      if (final) {renderMarkers();updateButtons();}
    }

    function moveTo(target, animate = true) {
      cancelAnimationFrame(frame);
      // Rebuild at the current position when interrupting an ongoing animation.
      markerLayer.removeAttribute('transform'); renderMarkers(); updateButtons();
      const start = {...camera}, started = performance.now();
      markerLayer.style.pointerEvents = 'none';
      function step(now) {
        const t = !animate || reducedMotion.matches ? 1 : Math.min(1,(now-started)/360);
        const ease = 1-Math.pow(1-t,3);
        camera = {k:start.k+(target.k-start.k)*ease,x:start.x+(target.x-start.x)*ease,y:start.y+(target.y-start.y)*ease};
        draw();
        // Only positions move: marker circles and labels keep their screen size.
        [...markerLayer.children].forEach(marker => marker.setAttribute('transform', `translate(${Number(marker.dataset.mapX)*camera.k+camera.x},${Number(marker.dataset.mapY)*camera.k+camera.y})`));
        if(t<1) frame=requestAnimationFrame(step);
        else {camera=target;markerLayer.removeAttribute('transform');markerLayer.style.pointerEvents='';draw(true);}
      }
      frame=requestAnimationFrame(step);
    }

    function hidePanel() {selected=[];panel.hidden=true;root.classList.remove('has-selection');}
    function reset(restoreFocus = false) {
      const focusedInside = panel.contains(document.activeElement);
      hidePanel();moveTo({k:1,x:0,y:0});
      status.textContent='Event auswählen. Klick auf die freie Karte führt zurück zur Gesamtansicht.';
      if (restoreFocus || focusedInside) (returnFocus?.isConnected ? returnFocus : [...list.querySelectorAll('button')].find(button=>button.dataset.eventId===returnEventId) || list.querySelector('button'))?.focus({preventScroll:true});
    }

    function eventCamera() {
      const mobile=width<700, event=selected[0];
      const point=projection([event.longitude,event.latitude]);
      const availableWidth=mobile?width:width-panel.offsetWidth-40;
      const availableHeight=mobile?height-panel.offsetHeight-78:height-80;
      const k=mobile?4:5;
      return {k,x:availableWidth/2-point[0]*k,y:60+availableHeight/2-point[1]*k};
    }

    function selectEvents(selection) {
      selected=selection;panel.hidden=false;root.classList.add('has-selection');
      root.querySelector('[data-detail-location]').textContent=selection[0].location;
      root.querySelector('#event-detail-title').textContent=selection.map(event=>event.name).join(' · ');
      root.querySelector('[data-detail-count]').textContent=selection.reduce((sum,event)=>sum+event.articles.length,0)+' Artikel';
      articleList.innerHTML=selection.map(event=>`${selection.length>1?'<h3>'+escapeHtml(event.name)+'</h3>':''}<ol>${event.articles.map(article=>{
        const archived=article.url.startsWith('https://web.archive.org/');
        return `<li class="event-popup__article"><time datetime="${escapeHtml(article.date)}">${dateFormat.format(new Date(article.date+'T12:00:00'))}</time>${archived?'<span class="event-popup__archive-label">Archivfassung</span>':''}<a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer"${archived?' title="Archivfassung öffnen"':''}>${escapeHtml(article.title)}</a></li>`;
      }).join('')}</ol>`).join('');
      articleList.scrollTop=0;moveTo(eventCamera());
      status.textContent=selection.map(event=>event.name).join(' und ')+' ausgewählt. Schließen oder freie Karte anklicken für die Gesamtansicht.';
      root.querySelector('#event-detail-title').focus({preventScroll:true});
    }

    function zoom(factor) {
      const k=Math.max(1,Math.min(MAX_ZOOM,camera.k*factor));
      if(k===1) {reset();return;}
      const mobile=width<700;
      const cx=selected.length&&!mobile?(width-panel.offsetWidth-40)/2:width/2;
      const cy=selected.length&&mobile?(height-panel.offsetHeight)/2:height/2;
      moveTo({k,x:cx-(cx-camera.x)*k/camera.k,y:cy-(cy-camera.y)*k/camera.k});
    }
    home.addEventListener('click',()=>reset());
    zoomIn.addEventListener('click',()=>zoom(1.5));
    zoomOut.addEventListener('click',()=>zoom(1/1.5));
    root.querySelector('[data-map-close]').addEventListener('click',()=>reset(true));
    root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();reset(true);}});
    svg.addEventListener('click',()=>{if(!suppressClick)reset();});
    svg.addEventListener('pointerdown',event=>{
      if(event.button!==0 || event.target.closest('[role="button"]'))return;
      cancelAnimationFrame(frame);markerLayer.removeAttribute('transform');markerLayer.style.pointerEvents='';draw(true);
      drag={x:event.clientX,y:event.clientY,camera:{...camera},moved:false};svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove',event=>{
      if(!drag)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(Math.hypot(dx,dy)>5)drag.moved=true;
      if(drag.moved){camera={...drag.camera,x:drag.camera.x+dx,y:drag.camera.y+dy};draw(true);}
    });
    function endDrag(){if(!drag)return;suppressClick=drag.moved;drag=null;setTimeout(()=>{suppressClick=false;},0);}
    svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
    list.innerHTML=events.map(event=>`<button type="button" data-event-id="${escapeHtml(event.id)}" aria-pressed="false"><span>${escapeHtml(event.name)}</span><small>${escapeHtml(event.location)} · ${event.articles.length}</small></button>`).join('');
    list.addEventListener('click',event=>{
      const button=event.target.closest('[data-event-id]');if(!button)return;
      returnFocus=button;returnEventId=button.dataset.eventId;selectEvents([events.find(item=>item.id===button.dataset.eventId)]);
      root.scrollIntoView({block:'start', behavior:reducedMotion.matches?'instant':'smooth'});
    });

    function resize() {
      width=root.clientWidth;height=root.clientHeight;if(!width||!height)return;
      cancelAnimationFrame(frame);markerLayer.removeAttribute('transform');markerLayer.style.pointerEvents='';
      svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
      projection.translate([width/2,height/2+12]).scale((Math.min(width-44,height-108)/2)/Math.SQRT2);
      ocean.setAttribute('d',path({type:'Sphere'}));land.setAttribute('d',path(countries));grid.setAttribute('d',path(graticule));
      camera=selected.length?eventCamera():{k:1,x:0,y:0};draw(true);
    }
    new ResizeObserver(resize).observe(root);resize();
    status.textContent='Event auswählen. Klick auf die freie Karte führt zurück zur Gesamtansicht.';
  }
  initialize().catch(error=>{root.hidden=true;list.hidden=true;status.classList.add('event-map-status--error');status.textContent=error.message;});
})();
