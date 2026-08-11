(() => {
  'use strict';

  const STORAGE_KEY = 'system_tracker_v2';
  const ICONS = ['check','book','code','dumbbell','droplet','moon','pill','heart','leaf','timer','star','walk','food','laptop'];
  const COLORS = {green:'#63b59b',blue:'#79aeda',teal:'#54b8b3',amber:'#d3a65f',gray:'#879591'};
  const MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const WEEKDAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const VIEWS = {
    overview:['Сегодня','Обзор'], habits:['Система','Привычки'], day:['Планер','План дня'],
    calendar:['Планер','Месяц / год'], analytics:['Данные','Аналитика'], history:['Архив','История'], settings:['Приложение','Настройки']
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
  const pad = n => String(n).padStart(2,'0');
  const todayKey = () => dateKey(new Date());
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parseDate = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); };
  const addDays = (key,n) => { const d=parseDate(key); d.setDate(d.getDate()+n); return dateKey(d); };
  const compareDate = (a,b) => a.localeCompare(b);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function defaultState(){
    const today=todayKey();
    const h1=uid(),h2=uid(),h3=uid();
    return {
      version:2,
      settings:{appName:'Система',theme:'neon',background:'noise',customBackground:''},
      habits:[
        {id:h1,name:'SQL',metric:'duration',target:50,unit:'мин',assignMode:'manual',schedule:'daily',weekdays:[],color:'green',icon:'code',customIcon:'',note:'',active:true,createdAt:Date.now()},
        {id:h2,name:'Выйти из дома',metric:'check',target:1,unit:'раз',assignMode:'manual',schedule:'daily',weekdays:[],color:'blue',icon:'walk',customIcon:'',note:'',active:true,createdAt:Date.now()+1},
        {id:h3,name:'Источник жиров в еде',metric:'check',target:1,unit:'раз',assignMode:'manual',schedule:'daily',weekdays:[],color:'teal',icon:'food',customIcon:'',note:'',active:true,createdAt:Date.now()+2}
      ],
      habitSelections:{[today]:{[h1]:true,[h2]:true,[h3]:true}},
      habitLogs:{},
      tasks:[],
      taskCompletions:{},
      createdAt:Date.now()
    };
  }

  function normalize(raw){
    const base=defaultState();
    if(!raw || typeof raw!=='object') return base;
    return {
      version:2,
      settings:{...base.settings,...(raw.settings||raw.profile||{})},
      habits:Array.isArray(raw.habits)?raw.habits.map(h=>({
        id:h.id||uid(),name:h.name||h.title||'Привычка',metric:h.metric||'check',target:Number(h.target||1),unit:h.unit||'раз',
        assignMode:h.assignMode||'auto',schedule:h.schedule?.type||h.schedule||'daily',weekdays:h.schedule?.days||h.weekdays||[],
        color:['green','blue','teal','amber','gray'].includes(h.color)?h.color:'green',icon:ICONS.includes(h.icon)?h.icon:'check',customIcon:h.customIcon||'',note:h.note||h.description||'',active:h.active!==false,createdAt:h.createdAt||Date.now()
      })):base.habits,
      habitSelections:raw.habitSelections&&typeof raw.habitSelections==='object'?raw.habitSelections:{},
      habitLogs:normalizeHabitLogs(raw.habitLogs||{}),
      tasks:Array.isArray(raw.tasks)?raw.tasks.map(t=>({
        id:t.id||uid(),title:t.title||t.name||'Дело',date:t.date||todayKey(),timeMode:t.timeMode||(t.time?'exact':'none'),time:t.time||'',duration:Number(t.duration||t.estimate||30),color:['green','blue','teal','amber','gray'].includes(t.color)?t.color:'blue',repeat:t.repeat||t.recurrence||'none',note:t.note||t.notes||'',createdAt:t.createdAt||Date.now()
      })):[],
      taskCompletions:raw.taskCompletions&&typeof raw.taskCompletions==='object'?raw.taskCompletions:{},
      createdAt:raw.createdAt||Date.now()
    };
  }

  function normalizeHabitLogs(logs){
    const out={};
    Object.entries(logs||{}).forEach(([date,items])=>{
      out[date]={};
      Object.entries(items||{}).forEach(([id,val])=>{
        out[date][id]=typeof val==='object'&&val!==null?{value:Number(val.value||0),updatedAt:val.updatedAt||Date.now()}:{value:Number(val||0),updatedAt:Date.now()};
      });
    });
    return out;
  }

  function loadState(){
    try{return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)))}catch{return defaultState()}
  }
  let state=loadState();
  let currentView='overview';
  let habitPeriod='today';
  let selectedHabitDate=todayKey();
  let selectedDay=todayKey();
  let selectedHistoryDate=todayKey();
  let habitMonthCursor=parseDate(todayKey());
  let habitYearCursor=parseDate(todayKey()).getFullYear();
  let calendarMode='month';
  let calendarCursor=parseDate(todayKey());
  let calendarYear=parseDate(todayKey()).getFullYear();
  let analyticsDays=30;
  let analyticsMetric='percent';
  let calendarTaskFilter='all';
  let selectedIcon='check';
  let customHabitIcon='';
  let toastTimer;

  function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
  function ensureDate(date){ if(!state.habitSelections[date])state.habitSelections[date]={}; if(!state.habitLogs[date])state.habitLogs[date]={}; if(!state.taskCompletions[date])state.taskCompletions[date]={}; }
  function iconSrc(h){return h.customIcon||`assets/icons/${h.icon||'check'}.svg`;}
  function prettyDate(key){const d=parseDate(key);return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;}
  function shortDate(key){const d=parseDate(key);return `${pad(d.getDate())}.${pad(d.getMonth()+1)}`;}
  function monthLabel(d){return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;}
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1900);}

  function scheduleMatches(h,date){
    const d=parseDate(date);
    if((h.schedule||'daily')==='daily') return true;
    return (h.weekdays||[]).map(Number).includes(d.getDay());
  }
  function hasHabitLog(date,id){return Object.prototype.hasOwnProperty.call(state.habitLogs[date]||{},id);}
  function habitValue(date,id){return Number(state.habitLogs[date]?.[id]?.value||0);}
  function isHabitSelected(h,date){
    if(h.active===false) return false;
    if(hasHabitLog(date,h.id)) return true;
    const override=state.habitSelections[date]?.[h.id];
    if(typeof override==='boolean') return override;
    return h.assignMode==='auto' && scheduleMatches(h,date);
  }
  function selectedHabits(date,includeArchived=false){return state.habits.filter(h=>(includeArchived||h.active!==false)&&isHabitSelected(h,date));}
  function habitProgress(h,date){
    const exists=hasHabitLog(date,h.id), value=habitValue(date,h.id), target=Math.max(.000001,Number(h.target||1));
    if(!exists) return 0;
    if(h.metric==='check') return value>=1?1:0;
    if(h.metric==='limit') return value<=target?1:clamp(target/value,0,1);
    return clamp(value/target,0,1);
  }
  function habitDone(h,date){return habitProgress(h,date)>=.999;}
  function metricLabel(h){
    if(h.metric==='check')return 'сделано / нет';
    if(h.metric==='duration')return `${h.target} ${h.unit||'мин'}`;
    if(h.metric==='limit')return `не больше ${h.target} ${h.unit||''}`.trim();
    return `${h.target} ${h.unit||''}`.trim();
  }
  function formatHabitValue(h,date){const v=habitValue(date,h.id);if(h.metric==='check')return v>=1?'сделано':'не отмечено';return `${formatNum(v)} / ${formatNum(h.target)} ${h.unit||''}`.trim();}
  function formatNum(v){return Number.isInteger(Number(v))?String(Number(v)):Number(v).toFixed(1).replace('.',',');}
  function habitStep(h){if(h.metric==='duration')return 10;if(h.metric==='value')return Number(h.target)>=10?1:.5;return 1;}
  function habitRate(date){const hs=selectedHabits(date);if(!hs.length)return 0;return hs.reduce((s,h)=>s+habitProgress(h,date),0)/hs.length;}

  function taskOccurs(t,date){
    if(compareDate(date,t.date)<0)return false;
    const td=parseDate(t.date),d=parseDate(date);
    if(t.repeat==='daily')return true;
    if(t.repeat==='weekly')return td.getDay()===d.getDay();
    if(t.repeat==='monthly')return td.getDate()===d.getDate();
    return t.date===date;
  }
  function tasksOnDate(date){return state.tasks.filter(t=>taskOccurs(t,date)).sort((a,b)=>taskSort(a,b));}
  function taskSort(a,b){const rank={exact:0,flexible:1,none:2};return rank[a.timeMode]-rank[b.timeMode]||(a.time||'99:99').localeCompare(b.time||'99:99')||a.createdAt-b.createdAt;}
  function taskDone(date,id){return !!state.taskCompletions[date]?.[id];}
  function dayHasActivity(date){return selectedHabits(date).length>0||Object.keys(state.habitLogs[date]||{}).length>0||tasksOnDate(date).length>0||Object.values(state.taskCompletions[date]||{}).some(Boolean);}
  function dayCompletion(date){
    const habits=selectedHabits(date),tasks=tasksOnDate(date);
    const values=[...habits.map(h=>habitProgress(h,date)),...tasks.map(t=>taskDone(date,t.id)?1:0)];
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  }
  function activeDayCountInMonth(d){const y=d.getFullYear(),m=d.getMonth();let n=0;for(let day=1;day<=new Date(y,m+1,0).getDate();day++){if(dayHasActivity(dateKey(new Date(y,m,day,12))))n++;}return n;}

  function applySettings(){
    const name=state.settings.appName||'Система';document.title=name;$('#brandName').textContent=name;$('#appNameInput').value=name;
    const theme=state.settings.theme||'neon';document.documentElement.dataset.theme=theme;
    if(state.settings.customBackground){document.documentElement.style.setProperty('--custom-bg',`url("${state.settings.customBackground}")`)}else{document.documentElement.style.setProperty('--custom-bg',`url('assets/backgrounds/${state.settings.background||'noise'}.svg')`)}
    $$('[data-bg]').forEach(b=>b.classList.toggle('active',!state.settings.customBackground&&b.dataset.bg===state.settings.background));
    $$('[data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===theme));
  }

  function switchView(view){
    currentView=view;
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`${view}View`));
    $$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const [eyebrow,title]=VIEWS[view];$('#pageEyebrow').textContent=eyebrow;$('#pageTitle').textContent=title;
    $('#drawer').classList.remove('open');
    renderView(view);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function renderView(view){if(view==='overview')renderOverview();if(view==='habits')renderHabits();if(view==='day')renderDay();if(view==='calendar')renderCalendar();if(view==='analytics')renderAnalytics();if(view==='history')renderHistory();if(view==='settings')applySettings();}
  function renderAll(){renderOverview();renderHabits();renderDay();renderCalendar();renderAnalytics();renderHistory();applySettings();}

  function renderOverview(){
    const today=todayKey(),d=parseDate(today);$('#overviewDate').textContent=`${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    const habits=selectedHabits(today);renderHabitCards($('#overviewHabits'),habits,today,true);$('#overviewHabitsEmpty').classList.toggle('hidden',habits.length>0);
    const tasks=tasksOnDate(today);$('#overviewTasks').innerHTML=tasks.slice(0,7).map(t=>taskRowHtml(t,today,true)).join('');$('#overviewTasksEmpty').classList.toggle('hidden',tasks.length>0);
  }

  function renderHabitCards(root,habits,date,compact=false){
    root.innerHTML='';habits.sort((a,b)=>a.createdAt-b.createdAt).forEach(h=>root.appendChild(createHabitCard(h,date,compact)));
  }
  function createHabitCard(h,date,compact){
    const card=document.createElement('article'),p=Math.round(habitProgress(h,date)*100),done=habitDone(h,date),step=habitStep(h);
    card.className=`habit-card ${done?'done':''}`;card.dataset.color=h.color||'green';
    const controls=h.metric==='check'
      ? `<div class="habit-controls single"><button class="main" data-habit-action="toggle" data-habit-id="${h.id}" data-date="${date}">${done?'Снять отметку':'Отметить'}</button></div>`
      : `<div class="habit-controls"><button data-habit-action="minus" data-step="${step}" data-habit-id="${h.id}" data-date="${date}">−</button><button class="main" data-habit-action="custom" data-habit-id="${h.id}" data-date="${date}">${escapeHtml(formatHabitValue(h,date))}</button><button data-habit-action="plus" data-step="${step}" data-habit-id="${h.id}" data-date="${date}">+</button></div>`;
    card.innerHTML=`<div class="habit-card-head"><img class="habit-icon" src="${escapeHtml(iconSrc(h))}" alt=""/><button class="card-menu" data-edit-habit="${h.id}" aria-label="Редактировать">•••</button></div><h3>${escapeHtml(h.name)}</h3><p class="habit-rule">${escapeHtml(metricLabel(h))}</p><div class="habit-progress"><i style="width:${p}%"></i></div><div class="habit-value-row"><span>${escapeHtml(formatHabitValue(h,date))}</span><strong>${p}%</strong></div>${controls}`;
    return card;
  }
  function handleHabitAction(btn){
    const h=state.habits.find(x=>x.id===btn.dataset.habitId);if(!h)return;const date=btn.dataset.date||selectedHabitDate;ensureDate(date);let v=habitValue(date,h.id);
    const action=btn.dataset.habitAction;
    if(action==='toggle')v=v>=1?0:1;
    if(action==='plus')v+=Number(btn.dataset.step||1);
    if(action==='minus')v=Math.max(0,v-Number(btn.dataset.step||1));
    if(action==='custom'){
      const raw=prompt(`Значение «${h.name}» (${h.unit||'значение'}):`,String(v));if(raw===null)return;const n=Number(raw.replace(',','.'));if(!Number.isFinite(n)||n<0){toast('Введите неотрицательное число');return;}v=n;
    }
    state.habitSelections[date][h.id]=true;state.habitLogs[date][h.id]={value:Math.round(v*100)/100,updatedAt:Date.now()};save();refreshAfterData();
  }

  function renderHabits(){
    $('#habitsTodayPanel').classList.toggle('hidden',habitPeriod!=='today');$('#habitsMonthPanel').classList.toggle('hidden',habitPeriod!=='month');$('#habitsYearPanel').classList.toggle('hidden',habitPeriod!=='year');
    $('#selectHabitsButton').classList.toggle('hidden',habitPeriod!=='today');
    if(habitPeriod==='today')renderHabitsToday();if(habitPeriod==='month')renderHabitMonth();if(habitPeriod==='year')renderHabitYear();
  }
  function renderHabitsToday(){
    const d=parseDate(selectedHabitDate);$('#habitDateWeekday').textContent=WEEKDAYS[d.getDay()];$('#habitDateLabel').textContent=prettyDate(selectedHabitDate);$('#habitDateInput').value=selectedHabitDate;
    const hs=selectedHabits(selectedHabitDate);renderHabitCards($('#todayHabitGrid'),hs,selectedHabitDate);$('#todayHabitEmpty').classList.toggle('hidden',hs.length>0);
    const q=$('#habitSearch').value.trim().toLowerCase();const all=state.habits.filter(h=>h.active!==false&&(!q||`${h.name} ${h.note}`.toLowerCase().includes(q)));
    $('#habitLibraryCount').textContent=`(${all.length})`;$('#habitLibrary').innerHTML=all.map(h=>`<article class="library-item"><img class="habit-icon" src="${escapeHtml(iconSrc(h))}" alt=""/><div><h3>${escapeHtml(h.name)}</h3><p>${escapeHtml(metricLabel(h))} · ${h.assignMode==='manual'?'вручную':'автоматически'}</p></div><div class="library-item-actions"><button data-select-single-habit="${h.id}" title="Добавить на день">＋</button><button data-edit-habit="${h.id}" title="Редактировать">•••</button></div></article>`).join('');
    fillHabitSelectors();
  }
  function renderHabitMonth(){
    fillHabitSelectors();const select=$('#habitMonthSelect'),h=state.habits.find(x=>x.id===select.value)||state.habits.find(x=>x.active!==false);if(!h){$('#habitMonthCalendar').innerHTML='<div class="empty-inline">Сначала создай привычку.</div>';return;}select.value=h.id;
    const y=habitMonthCursor.getFullYear(),m=habitMonthCursor.getMonth();$('#habitMonthLabel').textContent=monthLabel(habitMonthCursor);$('#habitMonthTitle').textContent=h.name;
    const first=new Date(y,m,1,12),start=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),cells=[];let selected=0,completed=0;
    for(let i=0;i<42;i++){
      const day=i-start+1,d=new Date(y,m,day,12),key=dateKey(d),outside=d.getMonth()!==m,isSel=isHabitSelected(h,key),p=habitProgress(h,key);if(!outside&&isSel){selected++;if(p>=.999)completed++;}
      cells.push(`<button class="month-day ${outside?'outside':''} ${key===todayKey()?'today':''}" data-history-date="${key}"><span class="day-number">${d.getDate()}</span>${isSel?`<span class="day-value">${hasHabitLog(key,h.id)?escapeHtml(formatHabitValue(h,key)):'—'}</span><i class="day-fill" style="width:${Math.round(p*100)}%;background:${COLORS[h.color]||COLORS.green}"></i>`:''}</button>`);
    }
    $('#habitMonthCalendar').innerHTML=cells.join('');$('#habitMonthSummary').textContent=selected?`${completed} из ${selected} дней`:'нет выбранных дней';
  }
  function renderHabitYear(){
    fillHabitSelectors();const select=$('#habitYearSelect'),h=state.habits.find(x=>x.id===select.value)||state.habits.find(x=>x.active!==false);if(!h){$('#habitYearGrid').innerHTML='<div class="empty-inline">Сначала создай привычку.</div>';return;}select.value=h.id;
    $('#habitYearLabel').textContent=habitYearCursor;$('#habitYearTitle').textContent=h.name;let total=0,done=0,html='';
    for(let m=0;m<12;m++){
      const first=new Date(habitYearCursor,m,1,12),start=(first.getDay()+6)%7,days=new Date(habitYearCursor,m+1,0).getDate();let cells='';for(let i=0;i<start;i++)cells+='<i></i>';
      for(let day=1;day<=days;day++){const key=dateKey(new Date(habitYearCursor,m,day,12)),sel=isHabitSelected(h,key),p=habitProgress(h,key);if(sel){total++;if(p>=.999)done++;}const level=!sel?'':p>=1?'level4':p>=.66?'level3':p>=.33?'level2':hasHabitLog(key,h.id)?'level1':'';cells+=`<i class="mini-day ${level}" title="${prettyDate(key)}: ${sel?formatHabitValue(h,key):'не выбрано'}"></i>`;}
      html+=`<section class="year-month"><h3>${MONTHS[m]}</h3><div class="mini-days">${cells}</div></section>`;
    }
    $('#habitYearGrid').innerHTML=html;$('#habitYearSummary').textContent=total?`${Math.round(done/total*100)}% выполнения`:'нет данных';
  }
  function fillHabitSelectors(){
    ['habitMonthSelect','habitYearSelect'].forEach(id=>{const s=$(`#${id}`),old=s.value;s.innerHTML=state.habits.filter(h=>h.active!==false).map(h=>`<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');if(state.habits.some(h=>h.id===old))s.value=old;});
  }

  function renderDay(){
    const d=parseDate(selectedDay);$('#dayWeekday').textContent=WEEKDAYS[d.getDay()];$('#dayDateLabel').textContent=prettyDate(selectedDay);$('#dayDateInput').value=selectedDay;
    const tasks=tasksOnDate(selectedDay),untimed=tasks.filter(t=>t.timeMode==='none'),timed=tasks.filter(t=>t.timeMode!=='none');
    $('#untimedTasks').innerHTML=untimed.map(t=>taskRowHtml(t,selectedDay,false)).join('');$('#untimedEmpty').classList.toggle('hidden',untimed.length>0);
    const hours=[...Array.from({length:12},(_,i)=>i+6),...Array.from({length:6},(_,i)=>i+18),...Array.from({length:6},(_,i)=>i)];
    const columns=[hours.slice(0,12),hours.slice(12)];
    $('#dayTimeline').innerHTML=columns.map((column,index)=>`<div class="schedule-column" data-part="${index}">${column.map(hour=>renderHourSlot(hour,timed)).join('')}</div>`).join('');
  }
  function renderHourSlot(hour,timed){
    const inHour=timed.filter(t=>Number((t.time||'00:00').split(':')[0])===hour);
    const groups=new Map();inHour.forEach(t=>{const key=t.time||`${pad(hour)}:00`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)});
    const content=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([time,items])=>`<div class="time-group"><span class="minute-label">${time}</span><div class="task-stack">${items.map(t=>scheduleTaskHtml(t)).join('')}</div></div>`).join('');
    return `<section class="schedule-hour" data-hour="${hour}"><div class="schedule-hour-label">${pad(hour)}:00</div><div class="schedule-hour-content">${content||'<span class="hour-empty">—</span>'}</div></section>`;
  }
  function scheduleTaskHtml(t){
    const done=taskDone(selectedDay,t.id),shift=t.timeMode==='flexible'?`<div class="flex-shift"><button data-shift-task="${t.id}" data-shift="-30">−30</button><button data-shift-task="${t.id}" data-shift="30">+30</button></div>`:'';
    return `<article class="schedule-task ${t.timeMode} ${done?'done':''}"><button class="task-check" data-toggle-task="${t.id}" data-date="${selectedDay}" aria-label="Готово">${done?'✓':''}</button><div class="schedule-task-copy"><strong>${escapeHtml(t.title)}</strong><small>${t.duration?`${t.duration} мин · `:''}${t.timeMode==='exact'?'точное время':'можно перенести'}</small>${t.note?`<p>${escapeHtml(t.note)}</p>`:''}</div>${shift}<button class="card-menu" data-edit-task="${t.id}" title="Изменить">•••</button></article>`;
  }
  function taskRowHtml(t,date,compact){const done=taskDone(date,t.id),time=t.timeMode==='none'?'без времени':`${t.time}${t.timeMode==='flexible'?' примерно':''}`;return `<article class="task-row ${t.timeMode} ${done?'done':''}"><button class="task-check" data-toggle-task="${t.id}" data-date="${date}" aria-label="Готово">${done?'✓':''}</button><div class="task-copy"><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(time)}${t.duration?` · ${t.duration} мин`:''}</span></div><div class="task-actions"><button data-edit-task="${t.id}" title="Изменить">•••</button></div></article>`;}
  function toggleTask(id,date){ensureDate(date);state.taskCompletions[date][id]=!taskDone(date,id);save();refreshAfterData();}
  function shiftTask(id,minutes){const t=state.tasks.find(x=>x.id===id);if(!t||!t.time)return;const [h,m]=t.time.split(':').map(Number),total=(h*60+m+Number(minutes)+1440)%1440;t.time=`${pad(Math.floor(total/60))}:${pad(total%60)}`;save();renderDay();renderOverview();renderCalendar();}

  function renderCalendar(){
    $('#calendarMonthPanel').classList.toggle('hidden',calendarMode!=='month');$('#calendarYearPanel').classList.toggle('hidden',calendarMode!=='year');
    if(calendarMode==='month')renderMonthCalendar();else renderYearCalendar();
  }
  function renderMonthCalendar(){
    const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(),first=new Date(y,m,1,12),start=(first.getDay()+6)%7;$('#calendarMonthLabel').textContent=monthLabel(calendarCursor);let html='';
    for(let i=0;i<42;i++){
      const day=i-start+1,d=new Date(y,m,day,12),key=dateKey(d),outside=d.getMonth()!==m;
      let tasks=tasksOnDate(key);if(calendarTaskFilter==='timed')tasks=tasks.filter(t=>t.timeMode!=='none');
      const score=dayCompletion(key);
      html+=`<button class="calendar-cell ${outside?'outside':''} ${key===todayKey()?'today':''}" data-open-day="${key}"><span class="num">${d.getDate()}</span><div class="cell-items">${tasks.slice(0,4).map(t=>`<span class="cell-item ${t.timeMode}">${escapeHtml(t.timeMode==='none'?'':t.time+' ')}${escapeHtml(t.title)}</span>`).join('')}${tasks.length>4?`<span class="cell-more">ещё ${tasks.length-4}</span>`:''}${selectedHabits(key).length?`<span class="habit-day-score">привычки ${Math.round(habitRate(key)*100)}%</span>`:''}</div>${score!==null?`<i class="calendar-score ${score>=.999?'complete':score>0?'partial':'missed'}"></i>`:''}</button>`;
    }
    $('#monthCalendar').innerHTML=html;
  }
  function renderYearCalendar(){
    $('#calendarYearLabel').textContent=calendarYear;let html='';for(let m=0;m<12;m++){const first=new Date(calendarYear,m,1,12),start=(first.getDay()+6)%7,days=new Date(calendarYear,m+1,0).getDate();let cells='';for(let i=0;i<start;i++)cells+='<i></i>';for(let day=1;day<=days;day++){const key=dateKey(new Date(calendarYear,m,day,12)),score=dayCompletion(key),level=score===null?'':score>=.999?'level4':score>=.5?'level3':score>0?'level2':'missed';cells+=`<i class="mini-day ${level}" title="${prettyDate(key)}${score===null?'':`: ${Math.round(score*100)}%`}"></i>`;}html+=`<section class="year-month" data-open-month="${m}"><h3>${MONTHS[m]}</h3><div class="mini-days">${cells}</div></section>`;}$('#yearCalendar').innerHTML=html;
  }

  function rangeDates(days){const end=todayKey(),arr=[];for(let i=days-1;i>=0;i--)arr.push(addDays(end,-i));return arr;}
  function analyticsHabitSet(date,id){if(id==='all')return selectedHabits(date);const h=state.habits.find(x=>x.id===id);return h&&isHabitSelected(h,date)?[h]:[];}
  function analyticsDayData(date,id){
    const habits=analyticsHabitSet(date,id),tasks=tasksOnDate(date);
    const habitProgressSum=habits.reduce((s,h)=>s+habitProgress(h,date),0),habitDoneCount=habits.filter(h=>habitDone(h,date)).length;
    const taskDoneCount=tasks.filter(t=>taskDone(date,t.id)).length;
    return {date,habitPlanned:habits.length,habitDone:habitDoneCount,habitPercent:habits.length?habitProgressSum/habits.length:null,taskPlanned:tasks.length,taskDone:taskDoneCount,taskPercent:tasks.length?taskDoneCount/tasks.length:null};
  }
  function renderAnalytics(){
    const dates=rangeDates(analyticsDays),old=$('#analyticsHabitSelect').value||'all';fillAnalyticsHabitSelect(old);const selectedId=$('#analyticsHabitSelect').value||'all',rows=dates.map(d=>analyticsDayData(d,selectedId));
    const habitValues=rows.filter(r=>r.habitPercent!==null).map(r=>r.habitPercent),habitDone=rows.reduce((s,r)=>s+r.habitDone,0),habitPlanned=rows.reduce((s,r)=>s+r.habitPlanned,0),taskDoneCount=rows.reduce((s,r)=>s+r.taskDone,0),taskPlanned=rows.reduce((s,r)=>s+r.taskPlanned,0);
    $('#kpiHabitRate').textContent=habitValues.length?`${Math.round(habitValues.reduce((a,b)=>a+b,0)/habitValues.length*100)}%`:'0%';
    $('#kpiHabitDone').textContent=`${habitDone} / ${habitPlanned}`;$('#kpiTaskDone').textContent=`${taskDoneCount} / ${taskPlanned}`;$('#kpiStreak').textContent=bestStreak(dates,selectedId);
    $('#analyticsChartTitle').textContent=analyticsMetric==='percent'?'Процент выполнения по дням':'Сколько выполнено по дням';
    renderCompletionChart(rows);renderRanking(dates);renderActivityHeatmap(rows);renderDonut(rows);
  }
  function fillAnalyticsHabitSelect(old){const s=$('#analyticsHabitSelect');s.innerHTML='<option value="all">Все привычки</option>'+state.habits.filter(h=>h.active!==false).map(h=>`<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');if(old&&[...s.options].some(o=>o.value===old))s.value=old;}
  function dayMetric(date,id){if(id==='all')return habitRate(date);const h=state.habits.find(x=>x.id===id);return h&&isHabitSelected(h,date)?habitProgress(h,date):null;}
  function bestStreak(dates,id){let best=0,cur=0;dates.forEach(d=>{const p=dayMetric(d,id);if(p!==null&&p>=.999){cur++;best=Math.max(best,cur)}else cur=0;});return best;}
  function renderCompletionChart(rows){
    const w=960,h=290,pL=46,pB=34,innerW=w-pL-16,innerH=h-pB-20,gap=innerW/Math.max(rows.length,1),bar=Math.max(2,Math.min(14,gap*.28));
    const maxCount=Math.max(1,...rows.map(r=>Math.max(r.habitDone,r.taskDone)));let shapes='',labels='';
    rows.forEach((r,i)=>{const center=pL+i*gap+gap/2;const hv=analyticsMetric==='percent'?r.habitPercent:r.habitDone,tv=analyticsMetric==='percent'?r.taskPercent:r.taskDone;const denom=analyticsMetric==='percent'?1:maxCount;
      [[hv,'habit',center-bar-1],[tv,'task',center+1]].forEach(([v,kind,x])=>{if(v===null)return;const bh=(Number(v)/denom)*innerH,y=12+innerH-bh;shapes+=`<rect class="chart-bar ${kind}" x="${x}" y="${y}" width="${bar}" height="${Math.max(1,bh)}" rx="${Math.min(4,bar/2)}"><title>${prettyDate(r.date)}: ${analyticsMetric==='percent'?Math.round(Number(v)*100)+'%':v}</title></rect>`;});
      if(i%Math.ceil(rows.length/10)===0)labels+=`<text x="${center}" y="${h-8}" text-anchor="middle" class="chart-label">${shortDate(r.date)}</text>`;
    });
    const topLabel=analyticsMetric==='percent'?'100%':String(maxCount);
    $('#completionChart').innerHTML=`<svg viewBox="0 0 ${w} ${h}"><line x1="${pL}" y1="12" x2="${pL}" y2="${12+innerH}" class="chart-axis"/><line x1="${pL}" y1="${12+innerH}" x2="${w}" y2="${12+innerH}" class="chart-axis"/><line x1="${pL}" y1="${12+innerH/2}" x2="${w}" y2="${12+innerH/2}" class="chart-grid"/><text x="4" y="20" class="chart-label">${topLabel}</text><text x="18" y="${16+innerH}" class="chart-label">0</text>${shapes}${labels}</svg>`;
  }
  function renderRanking(dates){
    const rows=state.habits.filter(h=>h.active!==false).map(h=>{const ds=dates.filter(d=>isHabitSelected(h,d));return {h,rate:ds.length?ds.reduce((s,d)=>s+habitProgress(h,d),0)/ds.length:null,count:ds.length}}).filter(x=>x.rate!==null).sort((a,b)=>b.rate-a.rate);
    $('#habitRanking').innerHTML=rows.length?rows.slice(0,8).map(x=>`<div class="ranking-row"><img class="habit-icon" src="${escapeHtml(iconSrc(x.h))}" alt=""/><div><strong>${escapeHtml(x.h.name)}</strong><small>${x.count} запланированных дней</small><div class="rank-track"><i style="width:${Math.round(x.rate*100)}%"></i></div></div><b>${Math.round(x.rate*100)}%</b></div>`).join(''):'<div class="empty-inline">Пока мало данных.</div>';
  }
  function renderActivityHeatmap(rows){
    const cols=analyticsDays<=30?Math.min(15,analyticsDays):analyticsDays<=90?18:26;$('#activityHeatmap').style.setProperty('--heat-cols',cols);
    $('#activityHeatmap').innerHTML=rows.map(r=>{const values=[...(r.habitPlanned?[r.habitPercent]:[]),...(r.taskPlanned?[r.taskPercent]:[])],score=values.length?values.reduce((a,b)=>a+(b??0),0)/values.length:null,level=score===null?'empty':score>=.999?'complete':score>0?'partial':'missed';return `<i class="heat-cell ${level}" title="${prettyDate(r.date)}: ${score===null?'нет плана':Math.round(score*100)+'%'}"><span>${parseDate(r.date).getDate()}</span></i>`}).join('');
  }
  function renderDonut(rows){
    let complete=0,partial=0,missed=0,empty=0;rows.forEach(r=>{const values=[...(r.habitPlanned?[r.habitPercent]:[]),...(r.taskPlanned?[r.taskPercent]:[])];if(!values.length){empty++;return;}const score=values.reduce((a,b)=>a+(b??0),0)/values.length;if(score>=.999)complete++;else if(score>0)partial++;else missed++;});
    const total=Math.max(1,complete+partial+missed+empty),a=complete/total*360,b=a+partial/total*360,c=b+missed/total*360;const donut=$('#analyticsDonut');donut.style.background=`conic-gradient(var(--green) 0 ${a}deg,var(--amber) ${a}deg ${b}deg,var(--danger) ${b}deg ${c}deg,var(--heat-empty) ${c}deg 360deg)`;$('#analyticsDonutValue').textContent=`${Math.round(complete/total*100)}%`;$('#analyticsDonutLegend').innerHTML=[["complete","Выполнено",complete],["partial","Частично",partial],["missed","Пропущено",missed],["empty","Без плана",empty]].map(([cls,label,val])=>`<div><i class="${cls}"></i><span>${label}</span><strong>${val}</strong></div>`).join('');
  }

  function activityDates(){
    const set=new Set([todayKey(),...Object.keys(state.habitSelections),...Object.keys(state.habitLogs),...Object.keys(state.taskCompletions)]);
    state.tasks.filter(t=>t.repeat==='none').forEach(t=>set.add(t.date));
    for(let i=0;i<365;i++){const d=addDays(todayKey(),-i);if(dayHasActivity(d))set.add(d)}
    return [...set].sort().reverse();
  }
  function renderHistory(){
    const q=$('#historySearch').value.trim().toLowerCase(),dates=activityDates().filter(d=>{if(!q)return true;return selectedHabits(d,true).some(h=>h.name.toLowerCase().includes(q))||tasksOnDate(d).some(t=>t.title.toLowerCase().includes(q));});
    if(!dates.includes(selectedHistoryDate))selectedHistoryDate=dates[0]||todayKey();$('#historyDateInput').value=selectedHistoryDate;
    $('#historyDates').innerHTML=dates.map(d=>`<button class="history-date ${d===selectedHistoryDate?'active':''}" data-history-date="${d}"><strong>${prettyDate(d)}</strong><span>${selectedHabits(d,true).length} привычек · ${tasksOnDate(d).length} дел</span></button>`).join('');renderHistoryDetail();
  }
  function renderHistoryDetail(){
    const date=selectedHistoryDate,habits=selectedHabits(date,true),tasks=tasksOnDate(date);$('#historyDetail').innerHTML=`<div class="history-detail-head"><div><span class="section-kicker">${WEEKDAYS[parseDate(date).getDay()].toUpperCase()}</span><h2>${prettyDate(date)}</h2></div><button class="secondary-button" data-open-day="${date}">Открыть день</button></div><section class="history-block"><h3>Привычки</h3>${habits.length?habits.map(h=>`<div class="history-entry"><img class="habit-icon" src="${escapeHtml(iconSrc(h))}" alt=""/><div><strong>${escapeHtml(h.name)}</strong><p>${escapeHtml(formatHabitValue(h,date))} · ${Math.round(habitProgress(h,date)*100)}%</p></div><button class="text-button" data-edit-history-habit="${h.id}">Изменить</button></div>`).join(''):'<div class="empty-inline">Не было выбрано.</div>'}</section><section class="history-block"><h3>Дела</h3>${tasks.length?tasks.map(t=>`<div class="history-entry"><div class="task-check">${taskDone(date,t.id)?'✓':''}</div><div><strong>${escapeHtml(t.title)}</strong><p>${t.timeMode==='none'?'без времени':escapeHtml(t.time)} · ${taskDone(date,t.id)?'выполнено':'не выполнено'}</p></div><button class="text-button" data-toggle-task="${t.id}" data-date="${date}">${taskDone(date,t.id)?'Вернуть':'Готово'}</button></div>`).join(''):'<div class="empty-inline">Дел не было.</div>'}</section>`;
  }

  function openHabitDialog(id=null){
    const h=id?state.habits.find(x=>x.id===id):null;$('#habitDialogTitle').textContent=h?'Изменить привычку':'Новая привычка';$('#habitId').value=h?.id||'';$('#habitName').value=h?.name||'';$('#habitMetric').value=h?.metric||'check';$('#habitTarget').value=h?.target??1;$('#habitUnit').value=h?.unit||'раз';$('#habitAssignMode').value=h?.assignMode||'manual';$('#habitSchedule').value=h?.schedule||'daily';$('#habitColor').value=h?.color||'green';$('#habitNote').value=h?.note||'';$('#habitSelectToday').checked=!h;selectedIcon=h?.icon||'check';customHabitIcon=h?.customIcon||'';$$('#habitWeekdays input').forEach(cb=>cb.checked=(h?.weekdays||[]).map(Number).includes(Number(cb.value)));$('#deleteHabit').classList.toggle('hidden',!h);updateHabitForm();renderIconPicker();$('#habitDialog').showModal();
  }
  function updateHabitForm(){
    const metric=$('#habitMetric').value,assign=$('#habitAssignMode').value,schedule=$('#habitSchedule').value;$('#habitTargetWrap').classList.toggle('hidden',metric==='check');$('#habitUnitWrap').classList.toggle('hidden',metric==='check');$('#habitScheduleWrap').classList.toggle('hidden',assign!=='auto');$('#habitWeekdaysWrap').classList.toggle('hidden',assign!=='auto'||schedule!=='weekdays');
    if(metric==='duration'&&($('#habitUnit').value==='раз'||!$('#habitUnit').value)){$('#habitUnit').value='мин';$('#habitTarget').value=50}
    if(metric==='count'&&$('#habitUnit').value==='мин')$('#habitUnit').value='раз';
    if(metric==='limit'&&Number($('#habitTarget').value)===1)$('#habitTarget').value=30;
  }
  function renderIconPicker(){$('#habitIconPicker').innerHTML=ICONS.map(i=>`<button type="button" class="icon-option ${selectedIcon===i&&!customHabitIcon?'active':''}" data-icon="${i}"><img src="assets/icons/${i}.svg" alt=""/></button>`).join('');}
  function saveHabit(e){
    e.preventDefault();const id=$('#habitId').value||uid(),existing=state.habits.find(h=>h.id===id),metric=$('#habitMetric').value;const habit={id,name:$('#habitName').value.trim(),metric,target:metric==='check'?1:Math.max(0,Number($('#habitTarget').value||0)),unit:metric==='check'?'раз':$('#habitUnit').value.trim(),assignMode:$('#habitAssignMode').value,schedule:$('#habitSchedule').value,weekdays:$$('#habitWeekdays input:checked').map(x=>Number(x.value)),color:$('#habitColor').value,icon:selectedIcon,customIcon:customHabitIcon,note:$('#habitNote').value.trim(),active:true,createdAt:existing?.createdAt||Date.now()};
    if(!habit.name){toast('Введите название');return;}if(existing)Object.assign(existing,habit);else state.habits.push(habit);if($('#habitSelectToday').checked){ensureDate(selectedHabitDate);state.habitSelections[selectedHabitDate][id]=true;}save();$('#habitDialog').close();refreshAfterData();toast(existing?'Привычка изменена':'Привычка добавлена');
  }
  function deleteHabit(){const id=$('#habitId').value;if(!id||!confirm('Удалить привычку? История значений останется только в экспортированной копии.'))return;state.habits=state.habits.filter(h=>h.id!==id);Object.values(state.habitSelections).forEach(x=>delete x[id]);Object.values(state.habitLogs).forEach(x=>delete x[id]);save();$('#habitDialog').close();refreshAfterData();}

  function openHabitSelectDialog(){
    const date=currentView==='habits'?selectedHabitDate:todayKey();$('#habitSelectDialog').dataset.date=date;$('#habitSelectTitle').textContent=`Привычки на ${prettyDate(date)}`;$('#habitSelectList').innerHTML=state.habits.filter(h=>h.active!==false).map(h=>`<label class="select-habit-item"><input type="checkbox" value="${h.id}" ${isHabitSelected(h,date)?'checked':''}/><img class="habit-icon" src="${escapeHtml(iconSrc(h))}" alt=""/><span><h3>${escapeHtml(h.name)}</h3><p>${escapeHtml(metricLabel(h))}${h.assignMode==='auto'?' · по расписанию':''}</p></span></label>`).join('')||'<div class="empty-inline">Сначала создай привычку.</div>';$('#habitSelectDialog').showModal();
  }
  function saveHabitSelection(e){e.preventDefault();const date=$('#habitSelectDialog').dataset.date;ensureDate(date);const checked=new Set($$('#habitSelectList input:checked').map(x=>x.value));state.habits.filter(h=>h.active!==false).forEach(h=>{state.habitSelections[date][h.id]=checked.has(h.id)});save();$('#habitSelectDialog').close();refreshAfterData();}

  function openTaskDialog(id=null,date=null){
    const t=id?state.tasks.find(x=>x.id===id):null;$('#taskDialogTitle').textContent=t?'Изменить дело':'Новое дело';$('#taskId').value=t?.id||'';$('#taskTitle').value=t?.title||'';$('#taskDate').value=t?.date||date||selectedDay||todayKey();$('#taskTimeMode').value=t?.timeMode||'none';$('#taskTime').value=t?.time||'12:00';$('#taskDuration').value=t?.duration??30;$('#taskRepeat').value=t?.repeat||'none';$('#taskNote').value=t?.note||'';$('#deleteTask').classList.toggle('hidden',!t);updateTaskForm();$('#taskDialog').showModal();
  }
  function updateTaskForm(){const show=$('#taskTimeMode').value!=='none';$('#taskTimeWrap').classList.toggle('hidden',!show);$('#taskDurationWrap').classList.toggle('hidden',!show);}
  function saveTask(e){
    e.preventDefault();const id=$('#taskId').value||uid(),existing=state.tasks.find(t=>t.id===id),t={id,title:$('#taskTitle').value.trim(),date:$('#taskDate').value,timeMode:$('#taskTimeMode').value,time:$('#taskTimeMode').value==='none'?'':$('#taskTime').value,duration:$('#taskTimeMode').value==='none'?0:Number($('#taskDuration').value||0),color:existing?.color||'blue',repeat:$('#taskRepeat').value,note:$('#taskNote').value.trim(),createdAt:existing?.createdAt||Date.now()};if(!t.title||!t.date){toast('Заполни название и дату');return;}if(existing)Object.assign(existing,t);else state.tasks.push(t);save();$('#taskDialog').close();selectedDay=t.date;refreshAfterData();toast(existing?'Дело изменено':'Дело добавлено');
  }
  function deleteTask(){const id=$('#taskId').value;if(!id||!confirm('Удалить дело и его повторения?'))return;state.tasks=state.tasks.filter(t=>t.id!==id);Object.values(state.taskCompletions).forEach(x=>delete x[id]);save();$('#taskDialog').close();refreshAfterData();}

  function refreshAfterData(){renderOverview();renderHabits();renderDay();renderCalendar();renderAnalytics();if(currentView==='history')renderHistory();}
  function closeDialog(id){document.getElementById(id)?.close();}

  function exportJson(){download(JSON.stringify(state,null,2),`system-backup-${todayKey()}.json`,'application/json');toast('Резервная копия скачана');}
  function exportCsv(){
    const rows=[['type','date','name','value','target','unit','status','time_type','time','note']];
    Object.entries(state.habitLogs).sort().forEach(([date,items])=>Object.entries(items).forEach(([id,log])=>{const h=state.habits.find(x=>x.id===id);rows.push(['habit',date,h?.name||id,log.value,h?.target||'',h?.unit||'',h&&habitDone(h,date)?'done':'partial','','',h?.note||'']);}));
    const dates=new Set([...Object.keys(state.taskCompletions),...state.tasks.filter(t=>t.repeat==='none').map(t=>t.date)]);for(let i=0;i<365;i++)dates.add(addDays(todayKey(),-i));
    [...dates].sort().forEach(date=>tasksOnDate(date).forEach(t=>rows.push(['task',date,t.title,taskDone(date,t.id)?1:0,'','',taskDone(date,t.id)?'done':'todo',t.timeMode,t.time,t.note])));
    const csv='\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\n');download(csv,`system-data-${todayKey()}.csv`,'text/csv;charset=utf-8');toast('CSV скачан');
  }
  function csvCell(v){const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function download(content,name,type){
    if(window.AndroidBridge && typeof window.AndroidBridge.saveText==='function'){
      window.AndroidBridge.saveText(name,String(content??''),type||'text/plain');
      return;
    }
    const a=document.createElement('a');
    const url=URL.createObjectURL(new Blob([content],{type}));
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function importJson(e){const file=e.target.files?.[0];if(!file)return;try{const raw=JSON.parse(await file.text());if(!raw||!Array.isArray(raw.habits)||!Array.isArray(raw.tasks))throw new Error();if(!confirm('Импорт заменит текущие данные. Продолжить?'))return;state=normalize(raw);save();applySettings();renderAll();toast('Данные импортированы');}catch{toast('Файл не похож на резервную копию');}e.target.value='';}
  function resetData(){if(!confirm('Удалить привычки, дела и всю историю?'))return;if(!confirm('Это действие нельзя отменить без резервной копии. Удалить?'))return;state=defaultState();save();selectedHabitDate=selectedDay=selectedHistoryDate=todayKey();calendarCursor=parseDate(todayKey());habitMonthCursor=parseDate(todayKey());habitYearCursor=calendarYear=parseDate(todayKey()).getFullYear();applySettings();renderAll();toast('Данные очищены');}
  async function imageToDataUrl(file,max=1200){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.82));};img.src=reader.result;};reader.readAsDataURL(file);});}

  function bindEvents(){
    document.addEventListener('click',e=>{
      const view=e.target.closest('[data-view]');if(view){switchView(view.dataset.view);return;}
      const target=e.target.closest('[data-view-target]');if(target){switchView(target.dataset.viewTarget);return;}
      const open=e.target.closest('[data-open]');if(open){if(open.dataset.open==='habit')openHabitDialog();if(open.dataset.open==='task')openTaskDialog(null,currentView==='day'?selectedDay:currentView==='calendar'?dateKey(calendarCursor):todayKey());if(open.dataset.open==='habitSelect')openHabitSelectDialog();return;}
      const close=e.target.closest('[data-close]');if(close){closeDialog(close.dataset.close);return;}
      const action=e.target.closest('[data-habit-action]');if(action){handleHabitAction(action);return;}
      const editHabit=e.target.closest('[data-edit-habit]');if(editHabit){openHabitDialog(editHabit.dataset.editHabit);return;}
      const selectOne=e.target.closest('[data-select-single-habit]');if(selectOne){ensureDate(selectedHabitDate);state.habitSelections[selectedHabitDate][selectOne.dataset.selectSingleHabit]=true;save();renderHabitsToday();renderOverview();return;}
      const toggle=e.target.closest('[data-toggle-task]');if(toggle){toggleTask(toggle.dataset.toggleTask,toggle.dataset.date||selectedDay);return;}
      const editTask=e.target.closest('[data-edit-task]');if(editTask){openTaskDialog(editTask.dataset.editTask);return;}
      const shift=e.target.closest('[data-shift-task]');if(shift){shiftTask(shift.dataset.shiftTask,shift.dataset.shift);return;}
      const day=e.target.closest('[data-open-day]');if(day){selectedDay=day.dataset.openDay;switchView('day');return;}
      const hdate=e.target.closest('[data-history-date]');if(hdate){selectedHistoryDate=hdate.dataset.historyDate;switchView('history');return;}
      const month=e.target.closest('[data-open-month]');if(month){calendarCursor=new Date(calendarYear,Number(month.dataset.openMonth),1,12);calendarMode='month';$$('#calendarTabs button').forEach(b=>b.classList.toggle('active',b.dataset.calendarMode==='month'));renderCalendar();return;}
      const editHistory=e.target.closest('[data-edit-history-habit]');if(editHistory){const h=state.habits.find(x=>x.id===editHistory.dataset.editHistoryHabit);if(!h)return;const raw=prompt(`Значение «${h.name}» за ${prettyDate(selectedHistoryDate)}:`,String(habitValue(selectedHistoryDate,h.id)));if(raw===null)return;const val=Number(raw.replace(',','.'));if(!Number.isFinite(val)||val<0){toast('Некорректное значение');return;}ensureDate(selectedHistoryDate);state.habitSelections[selectedHistoryDate][h.id]=true;state.habitLogs[selectedHistoryDate][h.id]={value:val,updatedAt:Date.now()};save();renderHistory();renderAnalytics();renderHabits();return;}
      const icon=e.target.closest('[data-icon]');if(icon){selectedIcon=icon.dataset.icon;customHabitIcon='';renderIconPicker();return;}
    });
    $('#quickAdd').addEventListener('click',()=>currentView==='habits'?openHabitDialog():openTaskDialog(null,currentView==='day'?selectedDay:todayKey()));
    $('#exportQuick').addEventListener('click',exportJson);
    $('#mobileMenu').addEventListener('click',()=>$('#drawer').classList.add('open'));$('#drawerBackdrop').addEventListener('click',()=>$('#drawer').classList.remove('open'));
    $('#habitPeriodTabs').addEventListener('click',e=>{const b=e.target.closest('[data-period]');if(!b)return;habitPeriod=b.dataset.period;$$('#habitPeriodTabs button').forEach(x=>x.classList.toggle('active',x===b));renderHabits();});
    $('#habitDayPrev').onclick=()=>{selectedHabitDate=addDays(selectedHabitDate,-1);renderHabitsToday();};$('#habitDayNext').onclick=()=>{selectedHabitDate=addDays(selectedHabitDate,1);renderHabitsToday();};$('#habitTodayButton').onclick=()=>{selectedHabitDate=todayKey();renderHabitsToday();};$('#habitDateButton').onclick=()=>$('#habitDateInput').showPicker?.();$('#habitDateInput').onchange=e=>{selectedHabitDate=e.target.value;renderHabitsToday();};
    $('#habitMonthPrev').onclick=()=>{habitMonthCursor.setMonth(habitMonthCursor.getMonth()-1);renderHabitMonth();};$('#habitMonthNext').onclick=()=>{habitMonthCursor.setMonth(habitMonthCursor.getMonth()+1);renderHabitMonth();};$('#habitYearPrev').onclick=()=>{habitYearCursor--;renderHabitYear();};$('#habitYearNext').onclick=()=>{habitYearCursor++;renderHabitYear();};$('#habitMonthSelect').onchange=renderHabitMonth;$('#habitYearSelect').onchange=renderHabitYear;$('#habitSearch').oninput=renderHabitsToday;
    $('#dayPrev').onclick=()=>{selectedDay=addDays(selectedDay,-1);renderDay();};$('#dayNext').onclick=()=>{selectedDay=addDays(selectedDay,1);renderDay();};$('#dayToday').onclick=()=>{selectedDay=todayKey();renderDay();};$('#dayDateButton').onclick=()=>$('#dayDateInput').showPicker?.();$('#dayDateInput').onchange=e=>{selectedDay=e.target.value;renderDay();};
    $('#calendarTabs').addEventListener('click',e=>{const b=e.target.closest('[data-calendar-mode]');if(!b)return;calendarMode=b.dataset.calendarMode;$$('#calendarTabs button').forEach(x=>x.classList.toggle('active',x===b));renderCalendar();});
    $('#calendarTaskFilter').addEventListener('click',e=>{const b=e.target.closest('[data-task-filter]');if(!b)return;calendarTaskFilter=b.dataset.taskFilter;$$('#calendarTaskFilter button').forEach(x=>x.classList.toggle('active',x===b));renderCalendar();});
    $('#calendarMonthPrev').onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderMonthCalendar();};$('#calendarMonthNext').onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderMonthCalendar();};$('#calendarYearPrev').onclick=()=>{calendarYear--;renderYearCalendar();};$('#calendarYearNext').onclick=()=>{calendarYear++;renderYearCalendar();};
    $('#analyticsRange').addEventListener('click',e=>{const b=e.target.closest('[data-range]');if(!b)return;analyticsDays=Number(b.dataset.range);$$('#analyticsRange button').forEach(x=>x.classList.toggle('active',x===b));renderAnalytics();});$('#analyticsHabitSelect').onchange=renderAnalytics;
    $('#analyticsMetric').addEventListener('click',e=>{const b=e.target.closest('[data-metric]');if(!b)return;analyticsMetric=b.dataset.metric;$$('#analyticsMetric button').forEach(x=>x.classList.toggle('active',x===b));renderAnalytics();});
    $('#historyDateInput').onchange=e=>{selectedHistoryDate=e.target.value;renderHistory();};$('#historySearch').oninput=renderHistory;
    $('#habitMetric').onchange=updateHabitForm;$('#habitAssignMode').onchange=updateHabitForm;$('#habitSchedule').onchange=updateHabitForm;$('#habitForm').onsubmit=saveHabit;$('#deleteHabit').onclick=deleteHabit;$('#habitSelectForm').onsubmit=saveHabitSelection;
    $('#habitCustomIcon').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{customHabitIcon=await imageToDataUrl(f,300);renderIconPicker();toast('Картинка добавлена');}catch{toast('Не удалось прочитать картинку')}};
    $('#taskTimeMode').onchange=updateTaskForm;$('#taskForm').onsubmit=saveTask;$('#deleteTask').onclick=deleteTask;
    $('#saveName').onclick=()=>{state.settings.appName=$('#appNameInput').value.trim()||'Система';save();applySettings();toast('Название сохранено');};
    $('#themeOptions').addEventListener('click',e=>{const b=e.target.closest('[data-theme]');if(!b)return;state.settings.theme=b.dataset.theme;save();applySettings();});
    $('#backgroundOptions').addEventListener('click',e=>{const b=e.target.closest('[data-bg]');if(!b)return;state.settings.background=b.dataset.bg;state.settings.customBackground='';save();applySettings();});
    $('#customBackground').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{state.settings.customBackground=await imageToDataUrl(f,1600);save();applySettings();toast('Фон сохранён');}catch{toast('Не удалось прочитать картинку')}};
    $('#removeBackground').onclick=()=>{state.settings.customBackground='';save();applySettings();};$('#exportJson').onclick=exportJson;$('#exportCsv').onclick=exportCsv;$('#importJson').onchange=importJson;$('#resetData').onclick=resetData;
  }

  function registerServiceWorker(){if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});}
  bindEvents();applySettings();renderAll();registerServiceWorker();
})();
