import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Select,
  MenuItem,
  Button,
  Tooltip,
  Stack,
  CircularProgress,
  Alert,
} from "@mui/material";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import PersonIcon from "@mui/icons-material/Person";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { supabase } from '../supabaseClient'; 
import { format as formatDateFns, parseISO as dateFnsParseISO } from 'date-fns';

// --- UTILITÁRIOS ---
function timeToMinutes(t) {
  if (!t || typeof t !== 'string' || !t.includes(':')) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function pad2(n) {
  return n.toString().padStart(2, "0");
}
function weekdayLabel(date) {
  const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const jsDay = date.getDay(); 
  if (jsDay === 0) return ""; 
  const idx = jsDay - 1; 
  return (
    `<span style="font-weight:600">${weekdays[idx]}</span><br/><span style="font-size:13px">${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}</span>`
  );
}
const PERIODOS = [
  { label: "30 minutos", value: "30min" },
  { label: "1 hora", value: "1h" },
  { label: "1h30", value: "1h30" },
  { label: "2 horas", value: "2h" }
];
const AGENDA_FREE_SLOT_INTERVAL = 15; // Minutos, para espelhar Agendamentos.js

function getMinutesFromPeriod(period) {
  if (!period) return 60;
  if (period === "30min") return 30;
  if (period === "1h") return 60;
  if (period === "1h30") return 90;
  if (period === "2h") return 120;
  const match = period.match(/(\d+)h(?:(\d+))?/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    return h * 60 + m;
  }
  return 60; 
}

function getSessionsForPackage(pkgName) {
  if (!pkgName) return 1; 
  const match = pkgName.match(/(\d+)\s*sess(ões|ao)/i);
  if (match && match[1]) return parseInt(match[1], 10);
  if (/5/.test(pkgName)) return 5;
  if (/10/.test(pkgName)) return 10;
  if (/20/.test(pkgName)) return 20;
  return 1;
}

function getPackageSessionNumber(client, clientPackageId, allSystemSessions, currentSessionId) {
  if (!clientPackageId || !client || !client.client_packages) return "";
  
  const clientPackage = client.client_packages.find(p => p.id === clientPackageId);
  if (!clientPackage) return "";

  const totalSessionsInPackage = clientPackage.total_sessions || getSessionsForPackage(clientPackage.name); 

  const packageSessions = allSystemSessions
    .filter(s => s.client_package_id === clientPackageId && (s.status === "scheduled" || s.status === "done"))
    .sort((a, b) => {
      const dateA = `${a.session_date}T${a.session_time || '00:00:00'}`;
      const dateB = `${b.session_date}T${b.session_time || '00:00:00'}`;
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.id || "").localeCompare(b.id || "");
    });

  const currentIndex = packageSessions.findIndex(s => s.id === currentSessionId);

  if (currentIndex === -1) {
    const usedSessionsCount = packageSessions.length;
    return `${usedSessionsCount}/${totalSessionsInPackage}`;
  }
  return `${currentIndex + 1}/${totalSessionsInPackage}`;
}

function sessionLineFull(sessao, clientsData, allSystemSessionsData) {
  let timeStr = sessao.session_time || "";
  if (timeStr && timeStr.includes(':')) {
    const parts = timeStr.split(':');
    timeStr = `${parts[0]}:${parts[1]}`; // Formato HH:mm
  }

  let line = `${timeStr} ${sessao.client_name || "Cliente?"}`;
  if (sessao.duration_period) line += ` ${sessao.duration_period}`;
  if (sessao.client_package_id) {
    const client = clientsData.find(c => c.id === sessao.client_id);
    if (client) {
      const sessaoNum = getPackageSessionNumber(client, sessao.client_package_id, allSystemSessionsData, sessao.id);
      if (sessaoNum) line += ` ${sessaoNum}`;
    }
  }
  if (sessao.status === "done") line += " ✅";
  return line;
}

// Lógica de horários livres adaptada de Agendamentos.js
const calculateAvailableSlotsLikeAgendamentos = ({
  targetDate,                     // Data alvo (string YYYY-MM-DD)
  currentDaySessionsFromSupabase, // Sessões do Supabase para o dia (objetos originais)
  period = "1h",                  // Período da sessão desejada (string como "1h", "30min")
  minDurationParam,               // Duração em minutos (pode ser passada ou calculada)
  interval = AGENDA_FREE_SLOT_INTERVAL, // Intervalo entre slots (minutos)
  currentDayBlockedSlots,         // Bloqueios do Supabase para o dia (objetos originais)
  currentDayCustomSlots           // Horários customizados (array de strings "HH:MM")
}) => {
  if (!targetDate) return [];
  const dateObj = dateFnsParseISO(targetDate + "T00:00:00"); // Usar date-fns para consistência
  const dow = dateObj.getDay();
  if (dow === 0) return []; // Domingo fechado

  const minDuration = minDurationParam || getMinutesFromPeriod(period);

  let startExpediente = 8 * 60; // 08:00 em minutos
  if (currentDayBlockedSlots && currentDayBlockedSlots.length > 0) {
    const endTimes = currentDayBlockedSlots.map(b => timeToMinutes(b.end_time)); // Assume que blockedSlots tem end_time
    if (endTimes.length > 0) {
        startExpediente = Math.max(...endTimes, startExpediente); // Garante que não comece antes das 8h e considera o fim do último bloqueio
    }
  }
  const endExpediente = dow === 6 ? 16 * 60 + 10 : 20 * 60 + 10; // Sábado até 16:10, outros dias até 20:10

  const daySessions = currentDaySessionsFromSupabase
    .map(s => ({
      id: s.id, 
      time: s.session_time, 
      period: s.duration_period,
      start: s.session_time ? timeToMinutes(s.session_time) : null,
      end: s.session_time && s.duration_period
        ? timeToMinutes(s.session_time) + getMinutesFromPeriod(s.duration_period)
        : null,
    }))
    .filter(s => s.start !== null && s.end !== null)
    .sort((a, b) => a.start - b.start);

  const customSlotsRaw = [...(currentDayCustomSlots || [])].sort();

  const customSlotsWithSession = customSlotsRaw.filter(slotTime => 
    daySessions.some(s => s.time === slotTime) 
  );

  let firstMarked = null; 
  if (customSlotsWithSession.length > 0) {
    const customMarkedMinutes = customSlotsWithSession.map(timeToMinutes);
    firstMarked = Math.min(...customMarkedMinutes);
  } else if (daySessions.length > 0) {
    firstMarked = daySessions[0].start;
  }

  let freeSlots = []; 

  function fillSlotsBeforeMarked(markedTime) { 
    const endOfPotentialSlot = markedTime - interval;
    let startOfPotentialSlot = endOfPotentialSlot - minDuration;

    while (startOfPotentialSlot >= startExpediente) {
      const currentSlotEndTime = startOfPotentialSlot + minDuration;
      const conflictWithSession = daySessions.some(s =>
        (startOfPotentialSlot < s.end && currentSlotEndTime > s.start)
      );
      const overlapWithExistingFreeSlot = freeSlots.some(freeTime => {
        const freeStart = timeToMinutes(freeTime);
        const freeEnd = freeStart + minDuration; 
        return (startOfPotentialSlot < freeEnd && currentSlotEndTime > freeStart);
      });

      if (!conflictWithSession && !overlapWithExistingFreeSlot) {
        freeSlots.push(minutesToTime(startOfPotentialSlot));
      }
      const endOfNextEarlierSlot = startOfPotentialSlot - interval;
      startOfPotentialSlot = endOfNextEarlierSlot - minDuration;
    }
  }

  function fillSlotsInInterval(windowStart, windowEnd) { 
    let slot = windowStart;
    while (slot + minDuration <= windowEnd) {
      const slotEnd = slot + minDuration;
      const conflict = daySessions.some(s => (slot < s.end && slotEnd > s.start));
      if (!conflict) {
        freeSlots.push(minutesToTime(slot));
      }
      slot += (minDuration + interval); 
    }
  }

  if (firstMarked !== null && firstMarked > startExpediente) {
    fillSlotsBeforeMarked(firstMarked);
    let lastProcessedEndTime = firstMarked; 
    const firstMarkedIsSession = daySessions.find(s => s.start === firstMarked);
    if (firstMarkedIsSession) {
        lastProcessedEndTime = firstMarkedIsSession.end;
    } else { 
        const sessionAtFirstMarked = daySessions.find(s => s.start === firstMarked);
        if (sessionAtFirstMarked) {
           lastProcessedEndTime = sessionAtFirstMarked.end;
        } else {
          lastProcessedEndTime = firstMarked + minDuration;
        }
    }

    const sessionsStrictlyAfterFirstMarked = daySessions.filter(s => s.start >= lastProcessedEndTime).sort((a,b)=>a.start-b.start);
    for (let i = 0; i < sessionsStrictlyAfterFirstMarked.length; i++) {
        const currentSession = sessionsStrictlyAfterFirstMarked[i];
        if (currentSession.start >= lastProcessedEndTime + interval) { 
            fillSlotsInInterval(lastProcessedEndTime + interval, currentSession.start - interval);
        }
        lastProcessedEndTime = Math.max(lastProcessedEndTime, currentSession.end);
    }
    if (lastProcessedEndTime < endExpediente) {
        fillSlotsInInterval(lastProcessedEndTime + interval, endExpediente);
    }
  } else {
    if (daySessions.length === 0) {
      fillSlotsInInterval(startExpediente, endExpediente);
    } else {
      if (daySessions[0].start >= startExpediente + interval) {
        fillSlotsInInterval(startExpediente, daySessions[0].start - interval);
      }
      for (let i = 0; i < daySessions.length - 1; i++) {
        const endCurr = daySessions[i].end;
        const startNext = daySessions[i + 1].start;
        if (startNext >= endCurr + interval) { 
            fillSlotsInInterval(endCurr + interval, startNext - interval);
        }
      }
      if (daySessions[daySessions.length - 1].end < endExpediente) {
        fillSlotsInInterval(daySessions[daySessions.length - 1].end + interval, endExpediente);
      }
    }
  }

  for (const tRaw of customSlotsRaw) { 
    const t = timeToMinutes(tRaw); 
    const tEnd = t + minDuration;
    if (
      t >= startExpediente &&
      tEnd <= endExpediente &&
      !daySessions.some(s => t < (s.end + interval) && tEnd > (s.start - interval))
    ) {
      if (!freeSlots.includes(tRaw)) { 
        freeSlots.push(tRaw);
      }
    }
  }

  freeSlots = Array.from(new Set(freeSlots)).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  return freeSlots;
};


function getWeekDates(startDate) { 
  const week = [];
  for (let i = 0; i < 6; i++) { 
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + i);
    week.push(day);
  }
  return week;
}
function getWeekStart(dateObj) { 
  const d = new Date(dateObj);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; 
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildWeekMarkedAndFreeCombined({
  allDisplayableSessions, 
  clientsData,
  weekStartDate, 
  allSystemSessionsData, 
  allSystemCustomSlots, 
  allSystemBlockedSlots 
}) {
  const weekDates = getWeekDates(weekStartDate); 
  let msg = "Horários da semana:\n\n";
  const requestedPeriodForCopy = "1h";

  for (const date of weekDates) {
    const dateStr = formatDateFns(date, "yyyy-MM-dd");
    
    const daySessionsOriginalData = allDisplayableSessions
      .filter(s => s.session_date === dateStr && s.session_time)
      .sort((a, b) => timeToMinutes(a.session_time) - timeToMinutes(b.session_time));

    const customSlotsOnDate = (allSystemCustomSlots || [])
        .filter(cs => cs.slot_date === dateStr)
        .map(cs => cs.slot_time);
    const blockedSlotsOnDate = (allSystemBlockedSlots || [])
        .filter(bs => bs.block_date === dateStr);

    const livres = calculateAvailableSlotsLikeAgendamentos({
      targetDate: dateStr,
      currentDaySessionsFromSupabase: daySessionsOriginalData, 
      period: requestedPeriodForCopy, 
      minDurationParam: getMinutesFromPeriod(requestedPeriodForCopy),
      interval: AGENDA_FREE_SLOT_INTERVAL,
      currentDayCustomSlots: customSlotsOnDate,
      currentDayBlockedSlots: blockedSlotsOnDate,
    });

    let allTimes = [];
    daySessionsOriginalData.forEach(s => { // Use original data for marked sessions
      allTimes.push({ time: s.session_time, type: "marcado", sessao: s });
    });
    livres.forEach(h => {
      if (!daySessionsOriginalData.some(s => s.session_time === h)) {
        allTimes.push({ time: h, type: "livre" });
      }
    });
    
    allTimes = Array.from(new Set(allTimes.map(item => JSON.stringify(item)))).map(str => JSON.parse(str)); 
    allTimes.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    if (allTimes.length === 0) continue;

    const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const jsDay = date.getDay();
    if (jsDay === 0) continue; 
    const weekLabel = weekdays[jsDay - 1]; 
    msg += `${weekLabel} (${pad2(date.getDate())}/${pad2(date.getMonth() + 1)})\n`;
    for (const item of allTimes) {
      if (item.type === "marcado") {
        msg += sessionLineFull(item.sessao, clientsData, allSystemSessionsData) + "\n";
      } else {
        msg += `${item.time}\n`; 
      }
    }
    msg += "\n";
  }
  return msg.trim();
}

export default function AgendaVisual() {
  const [displayPeriod, setDisplayPeriod] = useState("1h");
  const [currentWeekStartDate, setCurrentWeekStartDate] = useState(() => getWeekStart(new Date()));

  const [clientsData, setClientsData] = useState([]);
  const [allSystemSessionsData, setAllSystemSessionsData] = useState([]);
  const [allSystemCustomSlots, setAllSystemCustomSlots] = useState([]); 
  const [allSystemBlockedSlots, setAllSystemBlockedSlots] = useState([]); 

  const [loading, setLoading] = useState({
      initial: true, 
      allData: true, 
  });
  const [error, setError] = useState(null);
  
  useEffect(() => {
    async function fetchAllData() {
      console.log("useEffect: Iniciando fetchAllData");
      setLoading({ initial: true, allData: true });
      setError(null);
      try {
        const { data: clients, error: clientsError } = await supabase
          .from("clients")
          .select("*, client_packages(*, packages(id, name, total_sessions))"); 
        if (clientsError) throw new Error("Clientes: " + clientsError.message);
        setClientsData(clients || []);
        console.log("useEffect: Clientes carregados:", clients);

        const { data: sessions, error: sessionsError } = await supabase
          .from("sessions")
          .select("*"); 
        if (sessionsError) throw new Error("Sessões Sistema: " + sessionsError.message);
        // Mantido o processamento de professional_name aqui caso seja usado em outro lugar não visual
        const processedSessions = (sessions || []).map(s => ({
            ...s,
            professional_name: s.professional_name || (s.professional_id ? `Prof ${s.professional_id}` : 'N/D')
        }));
        setAllSystemSessionsData(processedSessions);
        console.log("useEffect: Sessões carregadas e processadas (allSystemSessionsData):", processedSessions);

        const { data: customSlots, error: customSlotsError } = await supabase
          .from("custom_slots")
          .select("*");
        if (customSlotsError) throw new Error("Custom Slots: " + customSlotsError.message);
        setAllSystemCustomSlots(customSlots || []);
        console.log("useEffect: Custom Slots carregados:", customSlots);
        
        const { data: blockedSlots, error: blockedSlotsError } = await supabase
          .from("blocked_slots")
          .select("*");
        if (blockedSlotsError) throw new Error("Blocked Slots: " + blockedSlotsError.message);
        setAllSystemBlockedSlots(blockedSlots || []);
        console.log("useEffect: Blocked Slots carregados:", blockedSlots);

      } catch (err) {
        console.error("useEffect: Erro ao buscar dados:", err);
        setError("Erro ao carregar dados: " + err.message);
      }
      setLoading({ initial: false, allData: false });
      console.log("useEffect: fetchAllData concluído, loading set to false.");
    }
    fetchAllData();
  }, []); 

  const displayableSessions = useMemo(() => {
    const filtered = allSystemSessionsData.filter(s => 
      s.status === "scheduled" || s.status === "done" || s.status === "confirmed"
    );
    console.log("useMemo displayableSessions:", filtered, "from allSystemSessionsData:", allSystemSessionsData);
    return filtered;
  }, [allSystemSessionsData]);

  const weekDaysToDisplay = useMemo(() => getWeekDates(currentWeekStartDate), [currentWeekStartDate]);

  const allTimesByDay = useMemo(() => {
    if (loading.initial) {
        console.log("useMemo allTimesByDay: loading.initial é true. Retornando {}.");
        return {};
    }
    console.log("useMemo allTimesByDay: Calculando horários. displayableSessions:", displayableSessions.length);

    const obj = {};

    weekDaysToDisplay.forEach(date => {
      const dateStr = formatDateFns(date, "yyyy-MM-dd");
      
      const sessionsOnDateOriginalData = displayableSessions.filter(s => s.session_date === dateStr && s.session_time);
      
      const customSlotsOnDate = (allSystemCustomSlots || [])
        .filter(cs => cs.slot_date === dateStr)
        .map(cs => cs.slot_time); 
      const blockedSlotsOnDate = (allSystemBlockedSlots || [])
        .filter(bs => bs.block_date === dateStr);

      const livres = calculateAvailableSlotsLikeAgendamentos({
        targetDate: dateStr,
        currentDaySessionsFromSupabase: sessionsOnDateOriginalData, 
        period: displayPeriod, 
        minDurationParam: getMinutesFromPeriod(displayPeriod),
        interval: AGENDA_FREE_SLOT_INTERVAL, 
        currentDayCustomSlots: customSlotsOnDate, 
        currentDayBlockedSlots: blockedSlotsOnDate, 
      });

      const daySessionsWithTime = sessionsOnDateOriginalData 
        .sort((a, b) => timeToMinutes(a.session_time) - timeToMinutes(b.session_time));
      
      let combinedTimes = new Set();
      livres.forEach(t => combinedTimes.add(t));
      daySessionsWithTime.forEach(s => combinedTimes.add(s.session_time));
      
      obj[dateStr] = Array.from(combinedTimes).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    });
    console.log("useMemo allTimesByDay: Horários calculados:", obj);
    return obj;
  }, [
      weekDaysToDisplay, 
      displayPeriod, 
      displayableSessions, 
      allSystemCustomSlots, 
      allSystemBlockedSlots, 
      loading.initial
    ]);

  const handleCopyHorariosLivres = useCallback((date) => {
    const dateStr = formatDateFns(date, "yyyy-MM-dd");
    const sessionsOnDateOriginalData = displayableSessions.filter(s => s.session_date === dateStr && s.session_time);
    const customSlotsOnDate = (allSystemCustomSlots || [])
        .filter(cs => cs.slot_date === dateStr)
        .map(cs => cs.slot_time);
    const blockedSlotsOnDate = (allSystemBlockedSlots || [])
        .filter(bs => bs.block_date === dateStr);
    
    const livres = calculateAvailableSlotsLikeAgendamentos({
      targetDate: dateStr,
      currentDaySessionsFromSupabase: sessionsOnDateOriginalData,
      period: displayPeriod, 
      minDurationParam: getMinutesFromPeriod(displayPeriod),
      interval: AGENDA_FREE_SLOT_INTERVAL,
      currentDayCustomSlots: customSlotsOnDate,
      currentDayBlockedSlots: blockedSlotsOnDate,
    });

    if (livres.length === 0) return;
    const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const jsDay = date.getDay();
    if (jsDay === 0) return;
    const weekLabel = weekdays[jsDay - 1];
    const header = `${weekLabel} (${pad2(date.getDate())}/${pad2(date.getMonth() + 1)})`;
    const text = [header, ...livres].join("\n");
    navigator.clipboard.writeText(text);
  }, [displayableSessions, allSystemCustomSlots, allSystemBlockedSlots, displayPeriod]);

  const handleCopySemanaCompleta = useCallback(() => {
    if (loading.allData) return;
    const msg = buildWeekMarkedAndFreeCombined({
      allDisplayableSessions: displayableSessions,
      clientsData,
      weekStartDate: currentWeekStartDate,
      allSystemSessionsData, 
      allSystemCustomSlots,
      allSystemBlockedSlots
    });
    navigator.clipboard.writeText(msg);
  }, [displayableSessions, clientsData, currentWeekStartDate, allSystemSessionsData, allSystemCustomSlots, allSystemBlockedSlots, loading.allData]);

  const goToPrevWeek = useCallback(() => {
    setCurrentWeekStartDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);
  const goToNextWeek = useCallback(() => {
    setCurrentWeekStartDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);
  
  const isOverallLoading = loading.allData;
  const showFullScreenLoader = loading.initial && !error;


  if (showFullScreenLoader) { 
     console.log("Render: Exibindo loader de tela cheia.");
     return <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh'}}><CircularProgress size={60} /></Box>;
  }
  console.log("Render: Renderizando agenda. Loading.initial:", loading.initial, "Loading.allData:", loading.allData, "Error:", error);
  console.log("Render: displayableSessions count:", displayableSessions.length);


  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>{error}</Alert>}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: "wrap", gap:1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: 1 }}>
          <EventAvailableIcon sx={{ mr: 1, mb: "-4px", color: "#00695f" }} />
          Agenda Visual
        </Typography>
        <Tooltip title="Copiar horários marcados + livres (1h) da semana">
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopySemanaCompleta}
            disabled={isOverallLoading || displayableSessions.length === 0 && (allSystemCustomSlots || []).length === 0}
            sx={{ borderRadius: 2, fontWeight: 500, bgcolor: "#f5f5f5", color: "#00695f", "&:hover": { bgcolor: "#e0f2f1" }, boxShadow: "none", textTransform: "none" }}
          >
            Copiar horários
          </Button>
        </Tooltip>
      </Stack>
      <Box sx={{ display: "flex", gap: 2, mb: 3, alignItems: "center", flexWrap: "wrap" }}>
        <Select
          value={displayPeriod}
          onChange={e => setDisplayPeriod(e.target.value)}
          size="small"
          sx={{ minWidth: 120, bgcolor: "#f5f5f5", borderRadius: 2 }}
          disabled={isOverallLoading}
        >
          {PERIODOS.map(p => (
            <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
          ))}
        </Select>
        <Button variant="contained" color="primary" size="small" onClick={goToPrevWeek} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }} disabled={isOverallLoading}>
          <AccessTimeIcon sx={{ mr: 1, fontSize: 18 }} />
          Semana anterior
        </Button>
        <Button variant="contained" color="primary" size="small" onClick={goToNextWeek} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }} disabled={isOverallLoading}>
          Próxima semana
          <AccessTimeIcon sx={{ ml: 1, fontSize: 18 }} />
        </Button>
        {isOverallLoading && <CircularProgress size={24} sx={{ml:1}}/>}
      </Box>
      <Paper sx={{ overflowX: "auto", p: { xs: 0.5, md: 2 }, borderRadius: 4, boxShadow: "0 4px 24px 0 #0001" }}>
        <Table size="small" sx={{ minWidth: 900, tableLayout: 'fixed', width: '100%' }}>
          <TableHead>
            <TableRow>
              {weekDaysToDisplay.map(date => (
                <TableCell
                  key={date.toISOString()}
                  align="center"
                  sx={{ 
                    fontWeight: 700, 
                    bgcolor: "#f5f5f5", 
                    fontSize: {xs: 13, sm: 15, md: 17}, 
                    borderRight: "2px solid #e0e0e0", 
                    borderTopLeftRadius: date === weekDaysToDisplay[0] ? 16 : 0, 
                    borderTopRightRadius: date === weekDaysToDisplay[weekDaysToDisplay.length - 1] ? 16 : 0, 
                    p: {xs: 0.5, md: 1},
                    width: `calc(100% / ${weekDaysToDisplay.length})` // Divide a largura igualmente
                  }}
                  dangerouslySetInnerHTML={{ __html: weekdayLabel(date) }}
                />
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: Math.max(1, ...weekDaysToDisplay.map(date => (allTimesByDay[formatDateFns(date, "yyyy-MM-dd")] || []).length)) }).map((_, rowIndex) => (
              <TableRow key={rowIndex} sx={{ "&:hover": { bgcolor: "#f9f9fa" } }}>
                {weekDaysToDisplay.map(date => {
                  const dateStr = formatDateFns(date, "yyyy-MM-dd");
                  const horariosDoDia = allTimesByDay[dateStr] || [];
                  const horario = horariosDoDia[rowIndex];

                  if (!horario) { 
                    return <TableCell key={dateStr + rowIndex + "empty"} sx={{border: "1px solid #eee", p: {xs: 0.5, md: 1}, height: 70, verticalAlign: 'top' }} />;
                  }
                  const sessao = displayableSessions.find(s => s.session_date === dateStr && s.session_time === horario);
                  
                  if (rowIndex < 2 && date.getDay() === weekDaysToDisplay[0].getDay()) { 
                      console.log(`Render Cell [${dateStr} ${horario}]: Encontrou sessão?`, sessao ? sessao.id : 'Não', 'Status:', sessao ? sessao.status : 'N/A');
                  }

                  if (sessao) {
                    let pacoteLabel = "";
                    if (sessao.client_package_id) {
                      const client = clientsData.find(c => c.id === sessao.client_id);
                      if (client) {
                        const sessaoNum = getPackageSessionNumber(client, sessao.client_package_id, allSystemSessionsData, sessao.id);
                        if (sessaoNum) pacoteLabel = ` ${sessaoNum}`;
                      }
                    }
                    return (
                      <TableCell
                        key={sessao.id + dateStr + horario} 
                        align="center"
                        sx={{ 
                            minHeight: 70, 
                            height: 70, 
                            verticalAlign: 'top', 
                            bgcolor: sessao.status === "done" ? "#b9f6ca" : (sessao.status === "confirmed" ? "#a7d8fd" : "#fff9c4"), 
                            color: "#111", 
                            border: "1px solid #e0e0e0", 
                            fontWeight: 500, 
                            borderRadius: 2, 
                            p: {xs: 0.5, md: 1}, 
                            fontSize: {xs:11, sm:13, md:14}, 
                            boxShadow: sessao.status === "done" ? "0 1px 4px 0 #b9f6ca99" : (sessao.status === "scheduled" || sessao.status === "confirmed") ? "0 1px 4px 0 #fff9c499" : undefined, 
                            transition: "box-shadow 0.2s",
                            overflow: "hidden", 
                            textOverflow: "ellipsis" 
                        }}
                      >
                        <Tooltip title={`Período: ${sessao.duration_period || 'N/A'}. Terapia: ${sessao.therapy_type || 'N/A'}`}>
                          <span>
                            <b style={{ fontSize: "inherit" }}>{horario}</b><br />
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <PersonIcon sx={{ fontSize: "inherit", mb: "-2px", color: "#111" }} />
                              <span style={{ fontWeight: 600 }}>{sessao.client_name || "Cliente?"}</span>
                            </span>
                            <span style={{ fontSize: "0.8em", color: "#333", fontWeight: 400, marginLeft: 6, display: "block" }}>
                              • {sessao.duration_period || 'N/A'}{pacoteLabel}
                            </span>
                            <span style={{ fontSize: "0.8em", color: sessao.status === "done" ? "#2e7d32" : (sessao.status === "confirmed" ? "#0d47a1" : "#bfa100"), fontWeight: 600, letterSpacing: 0.5 }}>
                              {sessao.status === "done" ? <DoneAllIcon sx={{ fontSize: "inherit", mb: "-2px" }} /> : <AccessTimeIcon sx={{ fontSize: "inherit", mb: "-2px" }} />}
                              {sessao.status === "done" ? " Realizada" : (sessao.status === "confirmed" ? " Confirmada" : " Marcada")}
                            </span>
                          </span>
                        </Tooltip>
                      </TableCell>
                    );
                  } else { 
                    return (
                      <TableCell
                        key={dateStr + horario + "free"} 
                        align="center"
                        sx={{ 
                            minHeight: 70, 
                            height: 70, 
                            verticalAlign: 'top', 
                            bgcolor: "#fff", 
                            color: "#111", 
                            border: "1px solid #eee", 
                            fontWeight: 400, 
                            borderRadius: 2, 
                            p: {xs: 0.5, md: 1}, 
                            fontSize: {xs:11, sm:13, md:14}, 
                            opacity: 0.95, 
                            transition: "background 0.2s",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                        }}
                      >
                        <b style={{ fontSize: "inherit" }}>{horario}</b><br />
                        <span style={{ fontSize: "0.8em", color: "#888", fontWeight: 500 }}>
                          <AccessTimeIcon sx={{ fontSize: "inherit", mb: "-2px", color: "#bbb" }} /> Livre
                        </span>
                      </TableCell>
                    );
                  }
                })}
              </TableRow>
            ))}
            <TableRow>
              {weekDaysToDisplay.map((date) => (
                <TableCell key={date.toISOString() + "-copybtn"} align="center" sx={{ border: "none", pt: 2, p: {xs:0.5, md:1}, verticalAlign: 'top' }}>
                  <Tooltip title="Copiar horários livres" arrow>
                    <Button variant="text" size="small" sx={{ minWidth: 0, borderRadius: "50%", p: 1, color: "#00695f", bgcolor: "#f5f5f5", "&:hover": { bgcolor: "#e0f2f1" }, boxShadow: "none", mx: "auto", display: "flex", justifyContent: "center", alignItems: "center" }}
                      onClick={() => handleCopyHorariosLivres(date)}
                      disabled={isOverallLoading}
                    >
                      <ContentCopyIcon sx={{ fontSize: {xs:18, md:22} }} />
                    </Button>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}