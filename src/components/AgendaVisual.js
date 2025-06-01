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
  IconButton,
  Snackbar as MuiSnackbar,
  Menu,
  TextField
} from "@mui/material";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import PersonIcon from "@mui/icons-material/Person";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
// import CloseIcon from '@mui/icons-material/Close'; // Removido
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
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
const AGENDA_FREE_SLOT_INTERVAL = 15;
const DEFAULT_START_EXPEDIENTE_MINUTES = 8 * 60; // 08:00

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

function getPackageSessionNumber(clientPackage) {
  if (!clientPackage) return "";
  const usedSessions = clientPackage.sessions_used || 0;
  const totalSessions =
    typeof clientPackage.total_sessions === 'number' ? clientPackage.total_sessions :
    (clientPackage.packages && typeof clientPackage.packages.total_sessions === 'number' ? clientPackage.packages.total_sessions :
    getSessionsForPackage(clientPackage.packages?.name) || 'N/A');
  return `${usedSessions}/${totalSessions}`;
}

function sessionLineFull(sessao, clientsData) {
  let timeStr = sessao.session_time || "";
  if (timeStr && timeStr.includes(':')) {
    const parts = timeStr.split(':');
    timeStr = `${parts[0]}:${parts[1]}`;
  }
  let line = `${timeStr} ${sessao.client_name || "Cliente?"}`;
  if (sessao.duration_period) line += ` ${sessao.duration_period}`;
  if (sessao.client_package_id) {
    const client = clientsData.find(c => c.id === sessao.client_id);
    if (client && client.client_packages) {
      const currentClientPackage = client.client_packages.find(pkg => pkg.id === sessao.client_package_id);
      if (currentClientPackage) {
        const sessaoNum = getPackageSessionNumber(currentClientPackage);
        if (sessaoNum) line += ` ${sessaoNum}`;
      }
    }
  }
  if (sessao.status === "done") line += " ✅";
  return line;
}

const calculateAvailableSlotsLikeAgendamentos = ({
  targetDate,
  currentDaySessionsFromSupabase,
  period = "1h",
  minDurationParam,
  interval = AGENDA_FREE_SLOT_INTERVAL,
  currentDayBlockedSlots,
  currentDayCustomSlots,
  customStartTimeForDay
}) => {
  if (!targetDate) return [];
  const dateObj = dateFnsParseISO(targetDate + "T00:00:00");
  const dow = dateObj.getDay();
  if (dow === 0) return [];

  if (currentDayBlockedSlots && currentDayBlockedSlots.some(b => b.block_date === targetDate && b.is_full_day)) {
    return [];
  }

  const minDuration = minDurationParam || getMinutesFromPeriod(period);
  
  let startExpedienteToUse = DEFAULT_START_EXPEDIENTE_MINUTES;
  if (customStartTimeForDay && typeof customStartTimeForDay === 'string' && customStartTimeForDay.includes(':')) {
    const customMinutes = timeToMinutes(customStartTimeForDay);
    if (customMinutes >= 0 && customMinutes < 24 * 60) {
        startExpedienteToUse = customMinutes;
    }
  }
  
  const endExpediente = dow === 6 ? 16 * 60 + 10 : 20 * 60 + 10;

  const daySessions = (currentDaySessionsFromSupabase || [])
    .filter(s => s.session_date === targetDate && (s.status === "scheduled" || s.status === "done" || s.status === "confirmed"))
    .map(s => ({
      id: `session-${s.id}`,
      type: 'session',
      time: s.session_time,
      period: s.duration_period,
      start: s.session_time ? timeToMinutes(s.session_time) : null,
      end: s.session_time && s.duration_period
        ? timeToMinutes(s.session_time) + getMinutesFromPeriod(s.duration_period)
        : null,
    }))
    .filter(s => s.start !== null && s.end !== null && s.end > s.start);

  const partialBlockedSlots = (currentDayBlockedSlots || [])
    .filter(b => b.block_date === targetDate && !b.is_full_day && b.start_time && b.end_time)
    .map(b => ({
      id: `block-${b.id}`,
      type: 'block',
      start: timeToMinutes(b.start_time),
      end: timeToMinutes(b.end_time),
    }))
    .filter(b => b.start !== null && b.end !== null && b.end > b.start);

  const ocupacoes = [...daySessions, ...partialBlockedSlots].sort((a, b) => a.start - b.start);

  let startExpediente = startExpedienteToUse; 
  if (partialBlockedSlots.length > 0) {
      const blockEndTimes = partialBlockedSlots.map(b => b.end);
      if (blockEndTimes.length > 0) {
          const latestBlockEndAffectingStart = Math.max(...blockEndTimes.filter(endTime => endTime > startExpediente && endTime < startExpediente + 120), startExpediente);
          startExpediente = latestBlockEndAffectingStart;
      }
  }

  const customSlotsRaw = [...(currentDayCustomSlots || [])].sort();

  const validCustomSlotsForFirstMarked = customSlotsRaw.filter(slotTime => {
    const t = timeToMinutes(slotTime);
    const tEnd = t + minDuration;
    return !ocupacoes.some(o => t < o.end && tEnd > o.start);
  });

  let firstMarked = null;
  const allMarkedStarts = [
      ...ocupacoes.map(o => o.start),
      ...validCustomSlotsForFirstMarked.map(timeToMinutes)
  ].sort((a,b) => a-b);

  if (allMarkedStarts.length > 0) {
      firstMarked = allMarkedStarts[0];
  }

  let freeSlots = [];

  function fillSlotsBeforeMarked(markedTime) {
    const endOfPotentialSlot = markedTime - interval;
    let startOfPotentialSlot = endOfPotentialSlot - minDuration;

    while (startOfPotentialSlot >= startExpediente) {
      const currentSlotEndTime = startOfPotentialSlot + minDuration;
      const conflictWithOcupacao = ocupacoes.some(o =>
        (startOfPotentialSlot < o.end && currentSlotEndTime > o.start)
      );
      const overlapWithExistingFreeSlot = freeSlots.some(freeTime => {
        const freeStart = timeToMinutes(freeTime);
        const freeEnd = freeStart + minDuration;
        return (startOfPotentialSlot < freeEnd && currentSlotEndTime > freeStart);
      });

      if (!conflictWithOcupacao && !overlapWithExistingFreeSlot) {
        freeSlots.push(minutesToTime(startOfPotentialSlot));
      }
      const endOfNextEarlierSlot = startOfPotentialSlot - interval;
      startOfPotentialSlot = endOfNextEarlierSlot - minDuration;
    }
  }

  function fillSlotsInInterval(windowStart, windowEnd) {
    let currentSlotStart = Math.max(windowStart, startExpediente);

    while (currentSlotStart + minDuration <= windowEnd) {
      const currentSlotEnd = currentSlotStart + minDuration;
      const conflict = ocupacoes.some(o => (currentSlotStart < o.end && currentSlotEnd > o.start));
      
      if (!conflict) {
        freeSlots.push(minutesToTime(currentSlotStart));
      }
      currentSlotStart += (minDuration + interval);
    }
  }

  if (firstMarked !== null && firstMarked > startExpediente) {
    fillSlotsBeforeMarked(firstMarked);
    let lastProcessedEndTime = firstMarked;

    const firstMarkedIsOcupacao = ocupacoes.find(o => o.start === firstMarked);
    if (firstMarkedIsOcupacao) {
        lastProcessedEndTime = firstMarkedIsOcupacao.end;
    } else {
        lastProcessedEndTime = firstMarked + minDuration;
    }

    const ocupacoesStrictlyAfterFirstMarked = ocupacoes.filter(o => o.start >= lastProcessedEndTime).sort((a,b)=>a.start-b.start);
    for (let i = 0; i < ocupacoesStrictlyAfterFirstMarked.length; i++) {
        const currentOcupacao = ocupacoesStrictlyAfterFirstMarked[i];
        if (currentOcupacao.start >= lastProcessedEndTime + interval) {
            fillSlotsInInterval(lastProcessedEndTime + interval, currentOcupacao.start - interval);
        }
        lastProcessedEndTime = Math.max(lastProcessedEndTime, currentOcupacao.end);
    }
    if (lastProcessedEndTime < endExpediente) {
        fillSlotsInInterval(lastProcessedEndTime + interval, endExpediente);
    }
  } else { 
    if (ocupacoes.length === 0) {
      fillSlotsInInterval(startExpediente, endExpediente);
    } else {
      if (ocupacoes[0].start >= startExpediente + interval) { 
        fillSlotsInInterval(startExpediente, ocupacoes[0].start - interval);
      }
      for (let i = 0; i < ocupacoes.length - 1; i++) {
        const endCurr = ocupacoes[i].end;
        const startNext = ocupacoes[i + 1].start;
        if (startNext >= endCurr + interval) {
            fillSlotsInInterval(endCurr + interval, startNext - interval);
        }
      }
      if (ocupacoes[ocupacoes.length - 1].end < endExpediente) {
        fillSlotsInInterval(ocupacoes[ocupacoes.length - 1].end + interval, endExpediente);
      }
    }
  }

  for (const tRaw of customSlotsRaw) {
    const t = timeToMinutes(tRaw);
    const tEnd = t + minDuration;
    if (
      t >= startExpediente && 
      tEnd <= endExpediente &&
      !ocupacoes.some(o => t < (o.end + interval) && tEnd > (o.start - interval)) 
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
  allSystemBlockedSlots,
  customDayStartTimes
}) {
  const weekDates = getWeekDates(weekStartDate);
  let msg = "Horários da semana:\n\n";
  const requestedPeriodForCopy = "1h";

  for (const date of weekDates) {
    const dateStr = formatDateFns(date, "yyyy-MM-dd");
    const currentCustomStartTime = customDayStartTimes[dateStr];

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
      customStartTimeForDay: currentCustomStartTime,
    });

    let allTimes = [];
    daySessionsOriginalData.forEach(s => {
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
  const [professionals, setProfessionals] = useState([]); // Ainda carrega para obter o ID

  const [loading, setLoading] = useState({
      initial: true,
      allData: true,
      // removingSlot: false, // Removido
      savingConfig: false, 
  });
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "info" });

  const [customDayStartTimes, setCustomDayStartTimes] = useState({});
  const [anchorElMenu, setAnchorElMenu] = useState(null);
  const [selectedDateForMenu, setSelectedDateForMenu] = useState(null);
  const [tempStartTime, setTempStartTime] = useState("");

  // Este ID será usado para todas as operações de customDayStartTimes
  const leticiaProfessionalId = useMemo(() => {
    const leticia = professionals.find(p => p.name?.toLowerCase().includes('letícia'));
    return leticia ? leticia.id : null;
  }, [professionals]);

  useEffect(() => {
    async function fetchAllData() {
      setLoading({ initial: true, allData: true, savingConfig: false }); // Removido removingSlot
      setError(null);
      let currentProfessionalId = null; // Variável local para o ID da Letícia

      try {
        const { data: clients, error: clientsError } = await supabase
          .from("clients")
          .select("*, client_packages(*, packages(id, name, total_sessions))");
        if (clientsError) throw new Error("Clientes: " + clientsError.message);
        setClientsData(clients || []);

        const { data: sessions, error: sessionsError } = await supabase
          .from("sessions")
          .select("*");
        if (sessionsError) throw new Error("Sessões Sistema: " + sessionsError.message);
        const processedSessions = (sessions || []).map(s => ({
            ...s,
            professional_name: s.professional_name || (s.professional_id ? `Prof ${s.professional_id}` : 'N/D')
        }));
        setAllSystemSessionsData(processedSessions);

        const { data: customSlots, error: customSlotsError } = await supabase
          .from("custom_slots")
          .select("*");
        if (customSlotsError) throw new Error("Custom Slots: " + customSlotsError.message);
        setAllSystemCustomSlots(customSlots || []);

        const { data: blockedSlots, error: blockedSlotsError } = await supabase
          .from("blocked_slots")
          .select("*");
        if (blockedSlotsError && blockedSlotsError.message.includes('relation "public.blocked_slots" does not exist')) {
            console.warn("Tabela 'blocked_slots' não encontrada. Funcionalidade de bloqueio pode ser limitada.");
            setAllSystemBlockedSlots([]);
        } else if (blockedSlotsError) {
            throw new Error("Blocked Slots: " + blockedSlotsError.message);
        } else {
            setAllSystemBlockedSlots(blockedSlots || []);
        }

        const { data: profsData, error: profsError } = await supabase
          .from('professionals')
          .select('id, name');
        if (profsError) throw new Error("Profissionais: " + profsError.message);
        setProfessionals(profsData || []); // Atualiza o estado de professionals
        
        const leticia = (profsData || []).find(p => p.name?.toLowerCase().includes('letícia'));
        currentProfessionalId = leticia ? leticia.id : null;

        if (currentProfessionalId) {
          const { data: dayConfigs, error: dayConfigsError } = await supabase
            .from('professional_day_configs')
            .select('config_date, custom_start_time')
            .eq('professional_id', currentProfessionalId);

          if (dayConfigsError) throw new Error("Configurações de Dia: " + dayConfigsError.message);
          
          const configsMap = {};
          (dayConfigs || []).forEach(config => {
            if (config.custom_start_time) { 
              configsMap[config.config_date] = config.custom_start_time.substring(0, 5); 
            }
          });
          setCustomDayStartTimes(configsMap);
        } else {
            console.warn("ID da profissional Letícia não encontrado. Não foi possível carregar configurações de início de expediente.");
            // Opcional: Notificar o usuário se o ID não for encontrado
            // setSnackbar({ open: true, message: "ID da profissional Letícia não encontrado para carregar configurações.", severity: "warning" });
        }

      } catch (err) {
        console.error("Erro ao carregar todos os dados:", err);
        setError("Erro ao carregar dados: " + err.message);
        setSnackbar({ open: true, message: "Erro ao carregar dados: " + err.message, severity: "error" });
      }
      setLoading(prev => ({ ...prev, initial: false, allData: false }));
    }
    fetchAllData();
  }, []); // Removido leticiaProfessionalId da dependência, pois é obtido dentro do efeito.

  const displayableSessions = useMemo(() => {
    return allSystemSessionsData.filter(s =>
      s.status === "scheduled" || s.status === "done" || s.status === "confirmed"
    );
  }, [allSystemSessionsData]);

  const weekDaysToDisplay = useMemo(() => getWeekDates(currentWeekStartDate), [currentWeekStartDate]);

  const allTimesByDay = useMemo(() => {
    if (loading.initial) return {};
    const obj = {};
    weekDaysToDisplay.forEach(date => {
      const dateStr = formatDateFns(date, "yyyy-MM-dd");
      const sessionsOnDateOriginalData = displayableSessions.filter(s => s.session_date === dateStr && s.session_time);
      const customSlotsOnDate = (allSystemCustomSlots || []).filter(cs => cs.slot_date === dateStr).map(cs => cs.slot_time);
      const blockedSlotsOnDate = (allSystemBlockedSlots || []).filter(bs => bs.block_date === dateStr);
      const currentCustomStartTime = customDayStartTimes[dateStr];

      const livres = calculateAvailableSlotsLikeAgendamentos({
        targetDate: dateStr,
        currentDaySessionsFromSupabase: sessionsOnDateOriginalData,
        period: displayPeriod,
        minDurationParam: getMinutesFromPeriod(displayPeriod),
        interval: AGENDA_FREE_SLOT_INTERVAL,
        currentDayCustomSlots: customSlotsOnDate,
        currentDayBlockedSlots: blockedSlotsOnDate,
        customStartTimeForDay: currentCustomStartTime,
      });

      const daySessionsWithTime = sessionsOnDateOriginalData.sort((a, b) => timeToMinutes(a.session_time) - timeToMinutes(b.session_time));
      let combinedTimes = new Set();
      livres.forEach(t => combinedTimes.add(t));
      daySessionsWithTime.forEach(s => combinedTimes.add(s.session_time));
      obj[dateStr] = Array.from(combinedTimes).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
    });
    return obj;
  }, [weekDaysToDisplay, displayPeriod, displayableSessions, allSystemCustomSlots, allSystemBlockedSlots, loading.initial, customDayStartTimes]);

  // handleRemoveFreeSlot removida

  const handleCopyHorariosLivres = useCallback((date) => {
    const dateStr = formatDateFns(date, "yyyy-MM-dd");
    const sessionsOnDateOriginalData = displayableSessions.filter(s => s.session_date === dateStr && s.session_time);
    const customSlotsOnDate = (allSystemCustomSlots || []).filter(cs => cs.slot_date === dateStr).map(cs => cs.slot_time);
    const blockedSlotsOnDate = (allSystemBlockedSlots || []).filter(bs => bs.block_date === dateStr);
    const currentCustomStartTime = customDayStartTimes[dateStr];

    const livres = calculateAvailableSlotsLikeAgendamentos({
      targetDate: dateStr,
      currentDaySessionsFromSupabase: sessionsOnDateOriginalData,
      period: displayPeriod,
      minDurationParam: getMinutesFromPeriod(displayPeriod),
      interval: AGENDA_FREE_SLOT_INTERVAL,
      currentDayCustomSlots: customSlotsOnDate,
      currentDayBlockedSlots: blockedSlotsOnDate,
      customStartTimeForDay: currentCustomStartTime,
    });

    if (livres.length === 0) {
      setSnackbar({ open: true, message: "Nenhum horário livre para copiar.", severity: "info" });
      return;
    }
    const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const jsDay = date.getDay();
    if (jsDay === 0) return;
    const weekLabel = weekdays[jsDay - 1];
    const header = `${weekLabel} (${pad2(date.getDate())}/${pad2(date.getMonth() + 1)})`;
    const text = [header, ...livres].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setSnackbar({ open: true, message: "Horários livres copiados!", severity: "success" });
    }).catch(() => {
      setSnackbar({ open: true, message: "Falha ao copiar horários.", severity: "error" });
    });
  }, [displayableSessions, allSystemCustomSlots, allSystemBlockedSlots, displayPeriod, customDayStartTimes]);

  const handleCopySemanaCompleta = useCallback(() => {
    if (loading.allData) return;
    const msg = buildWeekMarkedAndFreeCombined({
      allDisplayableSessions: displayableSessions,
      clientsData,
      weekStartDate: currentWeekStartDate,
      allSystemSessionsData,
      allSystemCustomSlots,
      allSystemBlockedSlots,
      customDayStartTimes
    });
    if (!msg) {
        setSnackbar({ open: true, message: "Nenhum horário para copiar na semana.", severity: "info" });
        return;
    }
    navigator.clipboard.writeText(msg).then(() => {
      setSnackbar({ open: true, message: "Horários da semana copiados!", severity: "success" });
    }).catch(() => {
      setSnackbar({ open: true, message: "Falha ao copiar horários da semana.", severity: "error" });
    });
  }, [displayableSessions, clientsData, currentWeekStartDate, allSystemSessionsData, allSystemCustomSlots, allSystemBlockedSlots, loading.allData, customDayStartTimes]);

  const goToPrevWeek = useCallback(() => setCurrentWeekStartDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; }), []);
  const goToNextWeek = useCallback(() => setCurrentWeekStartDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; }), []);

  const handleOpenDayMenu = (event, dateStr) => {
    if (!leticiaProfessionalId) {
        setSnackbar({ open: true, message: "ID da profissional Letícia não encontrado. Não é possível ajustar horários.", severity: "warning" });
        return;
    }
    setAnchorElMenu(event.currentTarget);
    setSelectedDateForMenu(dateStr);
    setTempStartTime(customDayStartTimes[dateStr] || "");
  };

  const handleCloseDayMenu = () => {
    setAnchorElMenu(null);
    setSelectedDateForMenu(null);
    setTempStartTime("");
  };

  const handleSaveCustomStartTime = async () => {
    if (!selectedDateForMenu) {
      setSnackbar({ open: true, message: "Erro: Nenhuma data selecionada.", severity: "error" });
      return;
    }
    if (!leticiaProfessionalId) {
      setSnackbar({ open: true, message: "ID da profissional Letícia não encontrado. Não é possível salvar.", severity: "error" });
      handleCloseDayMenu();
      return;
    }

    if (tempStartTime && !tempStartTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/)) {
      setSnackbar({ open: true, message: "Formato de hora inválido. Use HH:MM (ex: 09:00).", severity: "error" });
      return;
    }

    setLoading(prev => ({ ...prev, savingConfig: true }));
    setError(null);

    try {
      if (tempStartTime) {
        const { error: upsertError } = await supabase
          .from('professional_day_configs')
          .upsert({ 
            professional_id: leticiaProfessionalId, 
            config_date: selectedDateForMenu, 
            custom_start_time: tempStartTime 
          }, { onConflict: 'professional_id, config_date' });

        if (upsertError) throw upsertError;

        setCustomDayStartTimes(prev => ({
          ...prev,
          [selectedDateForMenu]: tempStartTime
        }));
        setSnackbar({ open: true, message: `Horário de início para ${selectedDateForMenu.split('-').reverse().join('/')} definido para ${tempStartTime}.`, severity: "success" });

      } else { // Resetar (tempStartTime está vazio)
        const { error: deleteError } = await supabase
          .from('professional_day_configs')
          .delete()
          .match({ professional_id: leticiaProfessionalId, config_date: selectedDateForMenu });

        if (deleteError) throw deleteError;

        setCustomDayStartTimes(prev => {
          const newTimes = { ...prev };
          delete newTimes[selectedDateForMenu];
          return newTimes;
        });
        setSnackbar({ open: true, message: `Horário de início para ${selectedDateForMenu.split('-').reverse().join('/')} resetado para o padrão.`, severity: "info" });
      }
    } catch (err) {
      console.error("Erro ao salvar configuração do dia:", err);
      setSnackbar({ open: true, message: `Erro ao salvar configuração: ${err.message}`, severity: "error" });
    } finally {
      setLoading(prev => ({ ...prev, savingConfig: false }));
      handleCloseDayMenu();
    }
  };
  
  const handleResetCustomStartTime = async () => {
    if (!selectedDateForMenu) {
      setSnackbar({ open: true, message: "Erro: Nenhuma data selecionada.", severity: "error" });
      return;
    }
     if (!leticiaProfessionalId) {
      setSnackbar({ open: true, message: "ID da profissional Letícia não encontrado. Não é possível resetar.", severity: "error" });
      handleCloseDayMenu();
      return;
    }

    setLoading(prev => ({ ...prev, savingConfig: true }));
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('professional_day_configs')
        .delete()
        .match({ professional_id: leticiaProfessionalId, config_date: selectedDateForMenu });

      if (deleteError) throw deleteError;

      setCustomDayStartTimes(prev => {
        const newTimes = { ...prev };
        delete newTimes[selectedDateForMenu];
        return newTimes;
      });
      setSnackbar({ open: true, message: `Horário de início para ${selectedDateForMenu.split('-').reverse().join('/')} resetado para o padrão.`, severity: "info" });

    } catch (err) {
      console.error("Erro ao resetar configuração do dia:", err);
      setSnackbar({ open: true, message: `Erro ao resetar configuração: ${err.message}`, severity: "error" });
    } finally {
      setLoading(prev => ({ ...prev, savingConfig: false }));
      handleCloseDayMenu();
    }
  };

  const isOverallLoading = loading.allData || loading.initial;
  const showFullScreenLoader = loading.initial && !error;

  if (showFullScreenLoader) {
     return <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh'}}><CircularProgress size={60} /></Box>;
  }

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      {error && <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>{error}</Alert>}
      <MuiSnackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </MuiSnackbar>
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
            disabled={isOverallLoading || loading.savingConfig}
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
          disabled={isOverallLoading || loading.savingConfig}
        >
          {PERIODOS.map(p => (
            <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
          ))}
        </Select>
        <Button variant="contained" color="primary" size="small" onClick={goToPrevWeek} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }} disabled={isOverallLoading || loading.savingConfig}>
          <AccessTimeIcon sx={{ mr: 1, fontSize: 18 }} />
          Semana anterior
        </Button>
        <Button variant="contained" color="primary" size="small" onClick={goToNextWeek} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }} disabled={isOverallLoading || loading.savingConfig}>
          Próxima semana
          <AccessTimeIcon sx={{ ml: 1, fontSize: 18 }} />
        </Button>
        {(isOverallLoading || loading.savingConfig) && <CircularProgress size={24} sx={{ml:1}}/>}
      </Box>
      <Paper sx={{ overflowX: "auto", p: { xs: 0.5, md: 2 }, borderRadius: 4, boxShadow: "0 4px 24px 0 #0001" }}>
        <Table size="small" sx={{ minWidth: 900, tableLayout: 'fixed', width: '100%' }}>
          <TableHead>
            <TableRow>
              {weekDaysToDisplay.map(date => {
                const dateStr = formatDateFns(date, "yyyy-MM-dd");
                const isCustomized = !!customDayStartTimes[dateStr];
                return (
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
                    width: `calc(100% / ${weekDaysToDisplay.length})`,
                    position: 'relative' 
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    <span dangerouslySetInnerHTML={{ __html: weekdayLabel(date) }} />
                    <Tooltip title={!leticiaProfessionalId ? "ID da profissional não encontrado" : `Ajustar horário de início para ${dateStr.split('-').reverse().join('/')}${isCustomized ? ` (Atual: ${customDayStartTimes[dateStr]})` : ''}`}>
                      <span> {/* Span para o Tooltip funcionar com botão desabilitado */}
                        <IconButton 
                          size="small" 
                          onClick={(e) => handleOpenDayMenu(e, dateStr)} 
                          disabled={!leticiaProfessionalId || loading.savingConfig}
                          sx={{p:0.2, color: isCustomized ? 'primary.main' : 'action.active' }}
                        >
                          <EditCalendarIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </TableCell>
              )})}
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

                  if (sessao) {
                    let pacoteLabel = "";
                    if (sessao.client_package_id) {
                      const client = clientsData.find(c => c.id === sessao.client_id);
                      if (client && client.client_packages) {
                        const currentClientPackage = client.client_packages.find(pkg => pkg.id === sessao.client_package_id);
                        if (currentClientPackage) {
                          const sessaoNum = getPackageSessionNumber(currentClientPackage);
                          if (sessaoNum) pacoteLabel = ` ${sessaoNum}`;
                        }
                      }
                    }
                    return (
                      <TableCell
                        key={sessao.id + dateStr + horario}
                        align="center"
                        sx={{
                            minHeight: 70, height: 70, verticalAlign: 'top',
                            bgcolor: sessao.status === "done" ? "#b9f6ca" : (sessao.status === "confirmed" ? "#a7d8fd" : "#fff9c4"),
                            color: "#111", border: "1px solid #e0e0e0", fontWeight: 500, borderRadius: 2,
                            p: {xs: 0.5, md: 1}, fontSize: {xs:11, sm:13, md:14},
                            boxShadow: sessao.status === "done" ? "0 1px 4px 0 #b9f6ca99" : (sessao.status === "scheduled" || sessao.status === "confirmed") ? "0 1px 4px 0 #fff9c499" : undefined,
                            transition: "box-shadow 0.2s", overflow: "hidden", textOverflow: "ellipsis"
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
                            minHeight: 70, height: 70, verticalAlign: 'top', bgcolor: "#fff", color: "#111",
                            border: "1px solid #eee", fontWeight: 400, borderRadius: 2, p: {xs: 0.5, md: 1},
                            fontSize: {xs:11, sm:13, md:14}, opacity: 0.95, transition: "background 0.2s",
                            overflow: "hidden", textOverflow: "ellipsis", position: 'relative'
                        }}
                      >
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
                           <b style={{ fontSize: "inherit" }}>{horario}</b>
                           <span style={{ fontSize: "0.8em", color: "#888", fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                             <AccessTimeIcon sx={{ fontSize: "inherit", mr: 0.5, color: "#bbb" }} /> Livre
                           </span>
                        </Box>
                        {/* IconButton com CloseIcon removido daqui */}
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
                      disabled={isOverallLoading || loading.savingConfig}
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
      <Menu
        anchorEl={anchorElMenu}
        open={Boolean(anchorElMenu)}
        onClose={handleCloseDayMenu}
        MenuListProps={{
          'aria-labelledby': 'day-options-button',
        }}
      >
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 280 }}>
          <Typography variant="subtitle1" gutterBottom sx={{fontWeight: 600}}>
            Ajustar Início do Expediente
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{mb:1}}>
            Dia: {selectedDateForMenu ? selectedDateForMenu.split('-').reverse().join('/') : ''}
          </Typography>
          <TextField
            label="Hora Início (HH:MM)"
            type="time"
            size="small"
            value={tempStartTime}
            onChange={(e) => setTempStartTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            helperText={`Padrão: ${minutesToTime(DEFAULT_START_EXPEDIENTE_MINUTES)}. Deixe vazio para resetar.`}
            disabled={loading.savingConfig || !leticiaProfessionalId}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{mt:2}}>
            <Button onClick={handleCloseDayMenu} size="small" color="inherit" disabled={loading.savingConfig}>
              Cancelar
            </Button>
            <Button 
              onClick={handleResetCustomStartTime} 
              size="small" 
              color="warning" 
              disabled={loading.savingConfig || !leticiaProfessionalId}
            >
              {loading.savingConfig && selectedDateForMenu && !tempStartTime ? <CircularProgress size={16} sx={{mr:1}}/> : null}
              Resetar
            </Button>
            <Button 
              variant="contained" 
              onClick={handleSaveCustomStartTime} 
              size="small" 
              disabled={loading.savingConfig || !leticiaProfessionalId}
            >
              {loading.savingConfig && selectedDateForMenu && tempStartTime ? <CircularProgress size={16} sx={{mr:1}}/> : null}
              Salvar
            </Button>
          </Stack>
        </Box>
      </Menu>
    </Box>
  );
}