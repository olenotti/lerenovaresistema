import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Button, Dialog, DialogTitle, DialogContent, FormControl, InputLabel, Select, MenuItem,
  TextField, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Typography, Collapse, Paper, ToggleButton, ToggleButtonGroup, Tooltip,
  FormControlLabel, Checkbox, Stack, CircularProgress, Alert
} from "@mui/material";
import { supabase } from '../supabaseClient'; 
import DeleteIcon from "@mui/icons-material/Delete";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

// --- Funções Utilitárias ---
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

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

const PERIODOS = [
  { label: "30 minutos", value: "30min" },
  { label: "1 hora", value: "1h" },
  { label: "1h30", value: "1h30" },
  { label: "2 horas", value: "2h" }
];

function formatDateAndWeekday(dateStr) {
  if (!dateStr) return { weekday: "", dateFormatted: "" };
  const dateObj = new Date(dateStr + "T00:00:00"); 
  const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const weekday = weekdays[dateObj.getDay()];
  const dateFormatted = dateObj ? `${String(dateObj.getDate()).padStart(2, "0")}/${String(dateObj.getMonth() + 1).padStart(2, "0")}` : "";
  return { weekday, dateFormatted };
}

const getAvailableTimesOriginalLogicAdapted = ({
  targetDate,
  currentDaySessionsFromSupabase,
  period = "1h",
  minDurationParam,
  interval = 15,
  currentDayBlockedSlots,
  currentDayCustomSlots
}) => {
  if (!targetDate) return [];
  const dow = new Date(targetDate + "T00:00:00").getDay();
  if (dow === 0) return [];

  const minDuration = minDurationParam || getMinutesFromPeriod(period);

  let startExpediente = 8 * 60;
  if (currentDayBlockedSlots && currentDayBlockedSlots.length > 0) {
    const endTimes = currentDayBlockedSlots.map(b => timeToMinutes(b.end_time));
    if (endTimes.length > 0) {
      startExpediente = Math.max(...endTimes);
      if (startExpediente < 8 * 60 && currentDayBlockedSlots.some(b => timeToMinutes(b.end_time) >= 8*60)) {
        // No-op
      } else if (currentDayBlockedSlots.length > 0 && Math.max(...endTimes) < 8*60) {
        startExpediente = 8 * 60;
      }
    }
  }
  const endExpediente = dow === 6 ? 16 * 60 + 10 : 20 * 60 + 10;

  const daySessions = currentDaySessionsFromSupabase
    .filter(s => s.session_date === targetDate && (s.status === "scheduled" || s.status === "done" || s.status === "confirmed"))
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

  const customSlotsRaw = [...currentDayCustomSlots].sort();
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
    if (!daySessions.some(s => t < (s.end + interval) && tEnd > (s.start - interval))) {
      if (!freeSlots.includes(tRaw)) { 
        freeSlots.push(tRaw);
      }
    }
  }
  freeSlots = Array.from(new Set(freeSlots)).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  return freeSlots;
};

export default function Agendamentos() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState("");

  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [professionals, setProfessionals] = useState([]); 
  const [sessions, setSessions] = useState([]); 
  const [allCustomSlotsForProfessional, setAllCustomSlotsForProfessional] = useState([]);
  const [allBlockedSlotsForProfessional, setAllBlockedSlotsForProfessional] = useState([]);

  const [selectedClientId, setSelectedClientId] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)); // Date for modal and general view
  const [selectedPeriod, setSelectedPeriod] = useState("1h");
  const [terapia, setTerapia] = useState("Massagem");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedHour, setSelectedHour] = useState("");
  const [showRealizadas, setShowRealizadas] = useState(true);
  const [isAvulsa, setIsAvulsa] = useState(true);
  
  const [currentProfessionalId, setCurrentProfessionalId] = useState(null); 
  
  const [showCustomHourForm, setShowCustomHourForm] = useState(false);
  const [customHourInput, setCustomHourInput] = useState(""); 
  const [customHoursForDayDisplayModal, setCustomHoursForDayDisplayModal] = useState([]); 

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const dateInputRef = useRef();

   const fetchClients = useCallback(async () => {
    const { data, error: fetchError } = await supabase.from('clients').select(`
      id, name, phone, 
      packages:client_packages(id, package_id, package_name, total_sessions, sessions_used, validity_date, status, package_definition:packages(session_duration_text))
    `);
    if (fetchError) {
      console.error("Error fetching clients with package definitions:", fetchError);
      throw fetchError;
    }
    setClients(data || []);
  }, []);

  const fetchProfessionals = useCallback(async () => {
    const { data, error: fetchError } = await supabase.from('professionals').select('*');
    if (fetchError) throw fetchError;
    setProfessionals(data || []);
    if (data && data.length > 0 && !currentProfessionalId) {
      setCurrentProfessionalId(data[0].id); 
    }
  }, [currentProfessionalId]);

  const fetchSessionsForProfessional = useCallback(async (professionalId) => {
    if (!professionalId) return;
    const { data, error: fetchError } = await supabase.from('sessions').select('*').eq('professional_id', professionalId);
    if (fetchError) throw fetchError;
    setSessions(data || []);
  }, []);

  const fetchAllCustomSlotsForProfessionalCallback = useCallback(async (professionalId) => {
    if (!professionalId) return;
    const { data, error: fetchError } = await supabase.from('custom_slots').select('*').eq('professional_id', professionalId);
    if (fetchError) throw fetchError;
    setAllCustomSlotsForProfessional(data || []);
    return data || [];
  }, []);
  
  const fetchCustomSlotsForDayModal = useCallback(async (professionalId, targetDate) => {
    if (!professionalId || !targetDate) {
      setCustomHoursForDayDisplayModal([]);
      return;
    }
    const { data, error: fetchError } = await supabase.from('custom_slots').select('slot_time').eq('professional_id', professionalId).eq('slot_date', targetDate);
    if (fetchError) throw fetchError;
    setCustomHoursForDayDisplayModal(data.map(s => s.slot_time).sort() || []);
  }, []);

  const fetchAllBlockedSlotsForProfessionalCallback = useCallback(async (professionalId) => {
    if (!professionalId) return;
    const { data, error: fetchError } = await supabase.from('blocked_slots').select('*').eq('professional_id', professionalId);
    if (fetchError) throw fetchError;
    setAllBlockedSlotsForProfessional(data || []);
    return data || [];
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true); setError(null);
      try {
        await fetchClients();
        await fetchProfessionals(); 
      } catch (e) {
        console.error("Erro ao carregar dados iniciais:", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    if (supabase) loadInitialData();
  }, [fetchClients, fetchProfessionals]);

  useEffect(() => {
    if (currentProfessionalId && supabase) {
      setLoading(true);
      Promise.all([
        fetchSessionsForProfessional(currentProfessionalId),
        fetchAllCustomSlotsForProfessionalCallback(currentProfessionalId),
        fetchAllBlockedSlotsForProfessionalCallback(currentProfessionalId),
        fetchCustomSlotsForDayModal(currentProfessionalId, date) // Uses 'date' state for modal
      ]).catch(e => {
        console.error("Erro ao carregar dados do profissional:", e);
        setError(e.message);
      }).finally(() => setLoading(false));
    }
  }, [currentProfessionalId, date, fetchSessionsForProfessional, fetchAllCustomSlotsForProfessionalCallback, fetchAllBlockedSlotsForProfessionalCallback, fetchCustomSlotsForDayModal]);

  const selectedClient = useMemo(() => clients.find(c => c.id === selectedClientId), [clients, selectedClientId]);

  const activePackages = useMemo(() => {
    if (!selectedClient || !Array.isArray(selectedClient.packages)) return [];
    const today = new Date().toISOString().slice(0, 10);
    return selectedClient.packages.filter(pkg => {
      if (pkg.validity_date && pkg.validity_date < today) return false;
      if (pkg.status !== 'active') return false;
      return (pkg.sessions_used || 0) < pkg.total_sessions;
    });
  }, [selectedClient]);

  useEffect(() => {
    setSelectedPackageId("");
    if (selectedClient && activePackages.length > 0) {
      setSelectedPackageId(activePackages[0].id);
    }
  }, [selectedClientId, selectedClient, activePackages]);

 useEffect(() => {
    if (!selectedPackageId) {
      setIsAvulsa(true); return;
    }
    setIsAvulsa(false);
    const clientPackageDetails = selectedClient?.packages.find(cp => cp.id === selectedPackageId);
    const durationFromPackageDef = clientPackageDetails?.package_definition?.session_duration_text;
    let newPeriod = "1h";
    if (durationFromPackageDef) {
      const foundPeriod = PERIODOS.find(p => p.value === durationFromPackageDef);
      if (foundPeriod) newPeriod = durationFromPackageDef;
      else console.warn(`Período "${durationFromPackageDef}" do pacote não é válido. Usando fallback "1h".`);
    } else {
      console.warn(`session_duration_text não encontrado para o pacote ID ${selectedPackageId}.`);
    }
    setSelectedPeriod(currentPeriod => currentPeriod !== newPeriod ? newPeriod : currentPeriod);
  }, [selectedPackageId, selectedClient]);

  const internalScheduleSession = async ({
    clientId, clientName, professionalIdToUse, sessionDateToUse, sessionTime,
    durationPeriod, therapyType, isAvulsaSession, clientPackageIdToUse, packageName,
    onSuccess, 
    setSpecificLoading,
  }) => {
    setSpecificLoading(true);
    setError(null); 
  
    try {
      const novaSessaoData = {
        client_id: clientId, client_name: clientName,
        client_package_id: clientPackageIdToUse, package_name: packageName,
        professional_id: professionalIdToUse, session_date: sessionDateToUse, // Use passed date
        session_time: sessionTime, duration_period: durationPeriod,
        therapy_type: therapyType, status: "scheduled",
        is_avulsa: isAvulsaSession, is_confirmed_by_client: false,
      };
  
      const { data: insertedSession, error: insertError } = await supabase
        .from('sessions').insert(novaSessaoData).select().single();
  
      if (insertError) throw insertError;
  
      if (insertedSession) {
        if (professionalIdToUse === currentProfessionalId) {
            setSessions(prev => [...prev, insertedSession].sort((a,b) => new Date(a.session_date + 'T' + a.session_time) - new Date(b.session_date + 'T' + b.session_time)));
        }
        
        if (!isAvulsaSession && clientPackageIdToUse) {
          const clientForPackageUpdate = clients.find(c => c.id === clientId);
          const packageToUpdate = clientForPackageUpdate?.packages.find(p => p.id === clientPackageIdToUse);
          if (packageToUpdate) {
            const newSessionsUsed = (packageToUpdate.sessions_used || 0) + 1;
            const { error: updatePackageError } = await supabase
              .from('client_packages').update({ sessions_used: newSessionsUsed }).eq('id', clientPackageIdToUse);
            if (updatePackageError) {
              console.error("Erro ao atualizar sessões usadas do pacote:", updatePackageError);
              setSnackbar("Sessão agendada, mas falha ao atualizar contagem do pacote.");
            } else {
              await fetchClients(); 
            }
          }
        }
        onSuccess(insertedSession);
      }
    } catch (err) {
      console.error("Erro em internalScheduleSession:", err);
      setError(`Erro ao agendar: ${err.message}`);
      setSnackbar(`Erro ao agendar: ${err.message}`);
    } finally {
      setSpecificLoading(false);
    }
  };

  const agendarSessao = async () => { // Agendamento pelo Modal
    if (!selectedClientId || !date || !selectedPeriod || !terapia || !selectedHour || !currentProfessionalId) {
      setSnackbar("Preencha todos os campos obrigatórios."); setTimeout(() => setSnackbar(""), 3000); return;
    }
    
    const cliente = clients.find(c => c.id === selectedClientId);
    const pacoteDoCliente = selectedPackageId ? activePackages.find(p => p.id === selectedPackageId) : null;

    await internalScheduleSession({
      clientId: selectedClientId,
      clientName: cliente?.name || "N/A",
      professionalIdToUse: currentProfessionalId,
      sessionDateToUse: date, // Uses 'date' state from modal
      sessionTime: selectedHour,
      durationPeriod: selectedPeriod,
      therapyType: terapia,
      isAvulsaSession: !pacoteDoCliente,
      clientPackageIdToUse: pacoteDoCliente ? pacoteDoCliente.id : null,
      packageName: pacoteDoCliente ? pacoteDoCliente.package_name : null,
      onSuccess: (insertedSession) => {
        setOpen(false);
        setSelectedClientId(""); setSelectedPackageId(""); setSelectedHour("");
        setTerapia("Massagem"); setIsAvulsa(true);
        setSnackbar("Sessão agendada!");
      },
      setSpecificLoading: setLoading,
    });
  };
  
  const handleChatSchedule = async () => {
    setChatLoading(true);
    setError(null);
    setSnackbar("");

    const parts = chatInput.split(',');
    let clientNameQuery, timeQuery, dateQuery, periodQuery = null;

    if (parts.length === 4) {
        clientNameQuery = parts[0].trim().toLowerCase();
        timeQuery = parts[1].trim();
        dateQuery = parts[2].trim();
        periodQuery = parts[3].trim();
    } else if (parts.length === 3) {
        clientNameQuery = parts[0].trim().toLowerCase();
        timeQuery = parts[1].trim();
        dateQuery = parts[2].trim();
    } else {
        setSnackbar(`Formato inválido. Use: Nome, HH:MM, DD/MM ou Nome, HH:MM, DD/MM, Período (ex: ${PERIODOS.map(p=>p.value).join('/')})`);
        setChatLoading(false);
        return;
    }

    if (!timeQuery.match(/^\d{2}:\d{2}$/)) {
      setSnackbar("Formato de hora inválido. Use HH:MM");
      setChatLoading(false);
      return;
    }

    const dateParts = dateQuery.split('/');
    if (dateParts.length !== 2 || !dateParts[0].match(/^\d{1,2}$/) || !dateParts[1].match(/^\d{1,2}$/)) {
        setSnackbar("Formato de data inválido. Use DD/MM");
        setChatLoading(false);
        return;
    }
    const day = dateParts[0].padStart(2, '0');
    const month = dateParts[1].padStart(2, '0');
    const currentYear = new Date().getFullYear();
    const sessionDateForChat = `${currentYear}-${month}-${day}`;

    const testDateObj = new Date(sessionDateForChat + "T00:00:00");
    if (isNaN(testDateObj.getTime()) || 
        testDateObj.getFullYear() !== currentYear ||
        (testDateObj.getMonth() + 1) !== parseInt(month) ||
        testDateObj.getDate() !== parseInt(day)) {
        setSnackbar("Data inválida (ex: dia ou mês não existe).");
        setChatLoading(false);
        return;
    }

    const leticiaProfessional = professionals.find(p => p.name.toLowerCase().includes('letícia'));
    if (!leticiaProfessional) {
      setSnackbar("Profissional 'Letícia' não encontrada.");
      setChatLoading(false);
      return;
    }
    const leticiaId = leticiaProfessional.id;

    const targetClient = clients.find(c => c.name.toLowerCase().includes(clientNameQuery));
    if (!targetClient) {
      setSnackbar(`Cliente "${parts[0].trim()}" não encontrado.`);
      setChatLoading(false);
      return;
    }

    let chatIsAvulsa = true;
    let chatPackageId = null;
    let chatPackageName = null;
    let chatDurationPeriod = "1h"; // Default

    const clientActivePackages = (targetClient.packages || []).filter(pkg => {
        const today = new Date().toISOString().slice(0, 10);
        if (pkg.validity_date && pkg.validity_date < today) return false;
        if (pkg.status !== 'active') return false;
        return (pkg.sessions_used || 0) < pkg.total_sessions;
    });

    if (clientActivePackages.length > 0) {
        const firstActivePackage = clientActivePackages[0];
        chatIsAvulsa = false;
        chatPackageId = firstActivePackage.id;
        chatPackageName = firstActivePackage.package_name;
        
        const packageDuration = firstActivePackage.package_definition?.session_duration_text;
        if (packageDuration && PERIODOS.some(p => p.value === packageDuration)) {
            chatDurationPeriod = packageDuration;
        } else {
            chatDurationPeriod = "1h"; // Default if package duration is invalid or not found
            if (packageDuration) {
                console.warn(`Duração do pacote "${packageDuration}" inválida para ${targetClient.name}, usando 1h para agendamento rápido.`);
                setSnackbar(`Aviso: Duração do pacote (${packageDuration}) inválida, usando 1h.`);
            }
        }

        if (periodQuery) {
            // Snackbar will be shown before scheduling attempt, might be overwritten.
            setSnackbar("Período informado no chat ignorado, pois o cliente possui pacote ativo com duração definida.");
        }
    } else if (periodQuery) { // No active package, and period was provided in chat
        const foundPeriod = PERIODOS.find(p => p.value.toLowerCase() === periodQuery.toLowerCase());
        if (foundPeriod) {
            chatDurationPeriod = foundPeriod.value;
        } else {
            setSnackbar(`Período "${periodQuery}" inválido. Válidos: ${PERIODOS.map(p=>p.value).join(', ')}. Agendamento cancelado.`);
            setChatLoading(false);
            return;
        }
    }
    // Else (no active package, no periodQuery), chatDurationPeriod remains "1h" (the initial default)
    
    const therapyForChat = "Massagem (Agendamento Rápido)";
    const currentMinDuration = getMinutesFromPeriod(chatDurationPeriod);

    let leticiaCustomSlotsForChatDay = [];
    let leticiaBlockedSlotsForChatDay = [];
    let leticiaSessionsForChatDay = [];

    try {
        const [customSlotsData, blockedSlotsData, sessionsData] = await Promise.all([
            supabase.from('custom_slots').select('slot_time').eq('professional_id', leticiaId).eq('slot_date', sessionDateForChat),
            supabase.from('blocked_slots').select('*').eq('professional_id', leticiaId).eq('block_date', sessionDateForChat),
            supabase.from('sessions').select('*').eq('professional_id', leticiaId).eq('session_date', sessionDateForChat)
        ]);
        if(customSlotsData.error) throw customSlotsData.error;
        if(blockedSlotsData.error) throw blockedSlotsData.error;
        if(sessionsData.error) throw sessionsData.error;
        
        leticiaCustomSlotsForChatDay = customSlotsData.data.map(cs => cs.slot_time);
        leticiaBlockedSlotsForChatDay = blockedSlotsData.data;
        leticiaSessionsForChatDay = sessionsData.data;

    } catch (fetchErr) {
        setSnackbar(`Erro ao buscar dados de Letícia para ${dateQuery}: ${fetchErr.message}`);
        setChatLoading(false);
        return;
    }
    
    const availableTimesForLeticia = getAvailableTimesOriginalLogicAdapted({
        targetDate: sessionDateForChat,
        currentDaySessionsFromSupabase: leticiaSessionsForChatDay,
        period: chatDurationPeriod, // Use the determined chatDurationPeriod
        minDurationParam: currentMinDuration,
        interval: 15,
        currentDayBlockedSlots: leticiaBlockedSlotsForChatDay,
        currentDayCustomSlots: leticiaCustomSlotsForChatDay,
    });

    let isSchedulable = availableTimesForLeticia.includes(timeQuery);

    if (!isSchedulable) {
        const isExistingCustomInFetchedList = leticiaCustomSlotsForChatDay.includes(timeQuery);

        if (isExistingCustomInFetchedList) {
             // Check if this existing custom slot is actually free for the required duration
            const queryTimeStartMinutes = timeToMinutes(timeQuery);
            const queryTimeEndMinutes = queryTimeStartMinutes + currentMinDuration;
            const conflictWithSession = leticiaSessionsForChatDay.some(s => {
                const sessionStart = timeToMinutes(s.session_time);
                const sessionEnd = sessionStart + getMinutesFromPeriod(s.duration_period);
                return queryTimeStartMinutes < sessionEnd && queryTimeEndMinutes > sessionStart;
            });

            if (conflictWithSession) {
                setSnackbar(`Horário ${timeQuery} em ${dateQuery} (personalizado existente) está ocupado.`);
                setChatLoading(false);
                return;
            } else {
                // It's an existing custom slot and it's free for the duration
                isSchedulable = true;
                 // Snackbar might have been set to "period ignored", let's ensure a positive message or clear it
                setSnackbar(prev => prev === "Período informado no chat ignorado, pois o cliente possui pacote ativo com duração definida." ? prev + " Prosseguindo..." : `Horário ${timeQuery} (personalizado existente) está livre. Agendando...`);
            }
        } else { // Not in available times and not an existing custom slot, try to create it
            const { data: newCustomSlot, error: insertCustomError } = await supabase
                .from('custom_slots')
                .insert({ professional_id: leticiaId, slot_date: sessionDateForChat, slot_time: timeQuery })
                .select()
                .single();

            if (insertCustomError) {
                if (insertCustomError.code === '23505') { // PostgreSQL unique_violation (duplicate key)
                    // This means it was created by someone else between fetch and insert, or our initial fetch was stale.
                    // Re-check if it's free.
                    const conflictsWithSession = leticiaSessionsForChatDay.some(s => {
                        const sessionStart = timeToMinutes(s.session_time);
                        const sessionEnd = sessionStart + getMinutesFromPeriod(s.duration_period);
                        const queryTimeStart = timeToMinutes(timeQuery);
                        const queryTimeEnd = queryTimeStart + currentMinDuration;
                        return queryTimeStart < sessionEnd && queryTimeEnd > sessionStart;
                    });

                    if (conflictsWithSession) {
                        setSnackbar(`Horário ${timeQuery} (personalizado) em ${dateQuery} já está ocupado por outra sessão.`);
                        setChatLoading(false);
                        return;
                    }
                    setSnackbar(`Horário ${timeQuery} (personalizado) em ${dateQuery} já existia e está livre. Agendando...`);
                    isSchedulable = true; 
                    await fetchAllCustomSlotsForProfessionalCallback(leticiaId); // Refresh general list
                    if (leticiaId === currentProfessionalId && sessionDateForChat === date) {
                        await fetchCustomSlotsForDayModal(leticiaId, sessionDateForChat); // Refresh modal list
                    }
                } else {
                    setSnackbar(`Erro ao criar horário personalizado para Letícia em ${dateQuery}: ${insertCustomError.message}`);
                    setChatLoading(false);
                    return;
                }
            } else {
                setSnackbar(`Horário personalizado ${timeQuery} criado para ${dateQuery}. Agendando...`);
                isSchedulable = true;
                await fetchAllCustomSlotsForProfessionalCallback(leticiaId);
                if (leticiaId === currentProfessionalId && sessionDateForChat === date) {
                    setCustomHoursForDayDisplayModal(prev => [...prev, newCustomSlot.slot_time].sort());
                }
            }
        }
    }


    if (!isSchedulable) {
        setSnackbar(`Horário ${timeQuery} em ${dateQuery} não pôde ser agendado para a duração de ${chatDurationPeriod}.`);
        setChatLoading(false);
        return;
    }

    await internalScheduleSession({
        clientId: targetClient.id,
        clientName: targetClient.name,
        professionalIdToUse: leticiaId,
        sessionDateToUse: sessionDateForChat, 
        sessionTime: timeQuery,
        durationPeriod: chatDurationPeriod, // Pass the determined duration
        therapyType: therapyForChat,
        isAvulsaSession: chatIsAvulsa,
        clientPackageIdToUse: chatPackageId,
        packageName: chatPackageName,
        onSuccess: (insertedSession) => {
            setChatInput(""); 
            setSnackbar(`Agendado para ${targetClient.name} às ${timeQuery} de ${dateQuery} (${chatDurationPeriod}) com Letícia.`);
            if (leticiaId === currentProfessionalId) { 
                fetchSessionsForProfessional(leticiaId); 
            }
        },
        setSpecificLoading: setChatLoading,
    });
  };

  const marcarComoRealizada = async (sessao) => {
    setLoading(true); setError(null);
    const { error: updateError } = await supabase.from('sessions').update({ status: 'done' }).eq('id', sessao.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      setSessions(prev => prev.map(s => s.id === sessao.id ? { ...s, status: 'done' } : s));
      setSnackbar("Sessão marcada como realizada!");
    }
    setLoading(false); setTimeout(() => setSnackbar(""), 3000);
  };

  const desmarcarSessao = async (sessaoId) => {
    setLoading(true); setError(null);
    const sessaoParaCancelar = sessions.find(s => s.id === sessaoId);
    if (!sessaoParaCancelar) {
        setError("Sessão não encontrada para cancelar."); setLoading(false); return;
    }
    const { error: deleteError } = await supabase.from('sessions').delete().eq('id', sessaoId);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setSessions(prev => prev.filter(s => s.id !== sessaoId));
      setSnackbar("Sessão removida!");
      if (sessaoParaCancelar.client_package_id && sessaoParaCancelar.status !== 'cancelled_by_client' && sessaoParaCancelar.status !== 'cancelled_by_professional') {
        const clientPackage = clients.find(c => c.id === sessaoParaCancelar.client_id)?.packages.find(p => p.id === sessaoParaCancelar.client_package_id);
        if (clientPackage && (clientPackage.sessions_used || 0) > 0) {
          const newSessionsUsed = clientPackage.sessions_used - 1;
          const { error: updatePackageError } = await supabase.from('client_packages').update({ sessions_used: newSessionsUsed }).eq('id', clientPackage.id);
          if (updatePackageError) {
            setError("Sessão removida, mas falha ao atualizar pacote.");
          } else {
            await fetchClients(); 
          }
        }
      }
    }
    setLoading(false); setTimeout(() => setSnackbar(""), 3000);
  };
  
  const marcarComoConfirmadaCliente = async (sessaoId) => {
    setLoading(true); setError(null);
    const { error: updateError } = await supabase.from('sessions').update({ is_confirmed_by_client: true }).eq('id', sessaoId);
    if (updateError) {
        setError(updateError.message);
    } else {
        setSessions(prev => prev.map(s => s.id === sessaoId ? { ...s, is_confirmed_by_client: true } : s));
        setSnackbar("Sessão confirmada pelo cliente!");
    }
    setLoading(false); setTimeout(() => setSnackbar(""), 3000);
  };

  const handleAddCustomHour = async () => {
    if (!customHourInput.match(/^\d{2}:\d{2}$/)) {
      setSnackbar("Formato de hora inválido (HH:MM)"); setTimeout(() => setSnackbar(""), 3000); return;
    }
    if (customHoursForDayDisplayModal.includes(customHourInput)) {
      setSnackbar("Horário já existe para este dia."); setTimeout(() => setSnackbar(""), 3000); return;
    }
    setLoading(true); setError(null);
    const { error: insertError } = await supabase.from('custom_slots').insert({ professional_id: currentProfessionalId, slot_date: date, slot_time: customHourInput });
    if (insertError) {
      setError(insertError.message);
    } else {
      await fetchAllCustomSlotsForProfessionalCallback(currentProfessionalId);
      await fetchCustomSlotsForDayModal(currentProfessionalId, date);
      setCustomHourInput("");
      setSnackbar("Horário personalizado adicionado.");
    }
    setLoading(false); setTimeout(() => setSnackbar(""), 3000);
  };

  const handleRemoveCustomHour = async (hourToRemove) => {
    setLoading(true); setError(null);
    const { error: deleteError } = await supabase.from('custom_slots').delete().eq('professional_id', currentProfessionalId).eq('slot_date', date).eq('slot_time', hourToRemove);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      await fetchAllCustomSlotsForProfessionalCallback(currentProfessionalId);
      await fetchCustomSlotsForDayModal(currentProfessionalId, date);
      setSnackbar("Horário personalizado removido.");
    }
    setLoading(false); setTimeout(() => setSnackbar(""), 3000);
  };
  
  const horariosLivres = useMemo(() => {
    if (!date || !selectedPeriod || !currentProfessionalId || loading) return [];
    const currentDaySessionsFromSupabase = sessions.filter(s => s.session_date === date && s.professional_id === currentProfessionalId && (s.status === "scheduled" || s.status === "done" || s.status === "confirmed"));
    const currentDayCustomSlots = allCustomSlotsForProfessional.filter(cs => cs.slot_date === date && cs.professional_id === currentProfessionalId).map(cs => cs.slot_time);
    const currentDayBlockedSlots = allBlockedSlotsForProfessional.filter(bs => bs.block_date === date && bs.professional_id === currentProfessionalId);
    return getAvailableTimesOriginalLogicAdapted({
      targetDate: date, currentDaySessionsFromSupabase, period: selectedPeriod,
      minDurationParam: getMinutesFromPeriod(selectedPeriod), interval: 15, 
      currentDayBlockedSlots, currentDayCustomSlots
    });
  }, [date, selectedPeriod, currentProfessionalId, sessions, allCustomSlotsForProfessional, allBlockedSlotsForProfessional, loading]);

  const agendadas = sessions.filter(s => s.status === "scheduled");
  const realizadas = sessions.filter(s => s.status === "done");
  const confirmar = sessions.filter(s => s.status === "scheduled" && !s.is_confirmed_by_client);

  const getPackageSessionText = useCallback((sessaoAlvo) => {
    if (!sessaoAlvo.client_package_id || !sessaoAlvo.client_id) return "";
    const client = clients.find(c => c.id === sessaoAlvo.client_id);
    if (!client) return "";
    const clientPackage = client.packages?.find(p => p.id === sessaoAlvo.client_package_id);
    if (!clientPackage) return `Sessão: ?/${sessaoAlvo.package_name ? '?' : (clientPackage?.total_sessions || 'N/A')}`;
    const sessoesDoPacote = sessions.filter(s => s.client_package_id === sessaoAlvo.client_package_id).sort((a, b) => {
        const dateA = new Date(`${a.session_date}T${a.session_time || '00:00:00'}`);
        const dateB = new Date(`${b.session_date}T${b.session_time || '00:00:00'}`);
        if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
        return a.id.localeCompare(b.id);
    });
    let chronologicalIndexInView = -1; 
    for (let i = 0; i < sessoesDoPacote.length; i++) {
        if (sessoesDoPacote[i].id === sessaoAlvo.id) {
            chronologicalIndexInView = i; break;
        }
    }
    if (chronologicalIndexInView === -1) {
        console.warn("getPackageSessionText: sessaoAlvo não encontrada.", { sessaoAlvo, sessoesDoPacote });
        return `Sessão: ${clientPackage.sessions_used || '?'}/${clientPackage.total_sessions || 'N/A'}`;
    }
    const numeroDaSessaoAtual = (clientPackage.sessions_used || 0) - sessoesDoPacote.length + (chronologicalIndexInView + 1);
    const totalSessoes = clientPackage.total_sessions || 'N/A';
    const finalNumeroDaSessao = Math.max(1, numeroDaSessaoAtual);
    return `Sessão: ${finalNumeroDaSessao}/${totalSessoes}`;
  }, [clients, sessions]);

  const getProfissionalLabel = useCallback((professionalId) => professionals.find(p => p.id === professionalId)?.name || 'N/A', [professionals]);

  function getMensagemConfirmacao(sessao) {
    const { weekday, dateFormatted } = formatDateAndWeekday(sessao.session_date);
    const terapeutaLabel = getProfissionalLabel(sessao.professional_id);
    const formattedTime = sessao.session_time ? sessao.session_time.substring(0, 5) : "-";
    let msg = `Segue a confirmação do seu agendamento:\nTerapia: ${sessao.therapy_type || "-"} | ${sessao.duration_period || "-"}\nData: ${weekday} (${dateFormatted})\nHorário: ${formattedTime}`;
    if (sessao.client_package_id) msg += `\n${getPackageSessionText(sessao)}`;
    msg += `\nTerapeuta: ${terapeutaLabel}\nLe Renovare | Open Mall The Square- Sala 424 | Bloco E- Ao lado do carrefour \nRod. Raposo Tavares, KM 22\n\n🙏🏼🍃✨`;
    return msg;
  }

   function getMensagemLembrete(sessao) {
    const { weekday, dateFormatted } = formatDateAndWeekday(sessao.session_date);
    const formattedTime = sessao.session_time ? sessao.session_time.substring(0, 5) : "-";
    return `Oii, aqui é a Lari e estou ajudando a Lê com a agenda de atendimentos🍃✨\n\nPassando para confirmar sua sessão:\nDia: ${weekday}${dateFormatted ? ` (${dateFormatted})` : ""}\nHorário: ${formattedTime}\nLocal: Le Renovare | Open Mall The Square- Sala 424 | Bloco E- Ao lado do carrefour \n\nPosso confirmar? Aguardamos seu retorno.💆🏼‍♀️💖`;
  }
  
  function handleCopyMensagem(sessao, tipo) {
    const msg = tipo === 1 ? getMensagemConfirmacao(sessao) : getMensagemLembrete(sessao);
    navigator.clipboard.writeText(msg).then(() => setSnackbar(`Mensagem ${tipo} copiada!`)).catch(err => setSnackbar(`Erro ao copiar: ${err.message}`));
    setTimeout(() => setSnackbar(""), 3000);
  }

  function handleOpenWhatsapp(sessao) {
    const client = clients.find(c => c.id === sessao.client_id);
    if (!client || !client.phone) { setSnackbar("Telefone do cliente não encontrado."); setTimeout(() => setSnackbar(""), 3000); return; }
    let num = client.phone.replace(/\D/g, "");
    if (num.length === 10 || num.length === 11) num = "55" + num;
    else if (num.length === 12 || num.length === 13) { if (!num.startsWith("55")) num = "55" + num.substring(num.length - (num.length === 12 ? 10 : 11)); }
    else { setSnackbar("Número de telefone inválido."); setTimeout(() => setSnackbar(""), 3000); return; }
    window.open(`https://wa.me/${num}`, "_blank");
  }

  if (loading && !open && professionals.length === 0 && !chatLoading) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (error && !open && !chatLoading) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;

  return (
    <Box sx={{ width: '100%', p: 0 }}>
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ mr: 2, minWidth: 'max-content'  }}>Profissional:</Typography>
        <ToggleButtonGroup value={currentProfessionalId} exclusive onChange={(_, value) => { if (value) setCurrentProfessionalId(value);}} color="primary" size="small">
          {professionals.map(p => (<ToggleButton key={p.id} value={p.id} disabled={(loading || chatLoading) && currentProfessionalId !== p.id}>{p.name}</ToggleButton>))}
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Button 
          variant="contained" color="primary" size="large"
          onClick={() => {
            const today = new Date().toISOString().slice(0,10);
            setDate(today); setSelectedClientId(""); setSelectedPackageId(""); setSelectedHour("");
            setTerapia("Massagem"); setSelectedPeriod("1h"); setIsAvulsa(true);
            if(currentProfessionalId) fetchCustomSlotsForDayModal(currentProfessionalId, today);
            setOpen(true);
          }}
          disabled={!currentProfessionalId || loading || chatLoading}
        >
          Agendar sessão
        </Button>
        
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TextField
            label="Ag. Rápido (Nome, HH:MM, DD/MM, [Período])" 
            variant="outlined"
            size="small"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            sx={{ width: { xs: '100%', sm: 350 } }} // Increased width slightly
            disabled={loading || chatLoading || !professionals.some(p => p.name.toLowerCase().includes('letícia'))}
            helperText={!professionals.some(p => p.name.toLowerCase().includes('letícia')) ? "Prof. Letícia não encontrada" : `Para Letícia. Períodos: ${PERIODOS.map(p=>p.value).join('/')}`}
          />
          <Button variant="contained" color="secondary" onClick={handleChatSchedule} disabled={loading || chatLoading || !chatInput || !professionals.some(p => p.name.toLowerCase().includes('letícia'))}>
            {chatLoading ? <CircularProgress size={24} color="inherit"/> : "Via Chat"}
          </Button>
        </Box>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Agendar Sessão {currentProfessionalId ? `(${getProfissionalLabel(currentProfessionalId)})` : ''}</DialogTitle>
        <DialogContent dividers sx={{pt: 2}}>
          {(loading && open) && <CircularProgress size={24} sx={{position: 'absolute', top: '50%', left: '50%', zIndex:1}}/>}
          {error && <Alert severity="error" sx={{mb:1}}>{error}</Alert>}
          <Box sx={{ mt: 1, minWidth: 250, filter: (loading && open) ? 'blur(2px)' : 'none' }}>
            <TextField label="Buscar cliente" variant="outlined" size="small" fullWidth sx={{ mb: 2 }} value={search} onChange={e => setSearch(e.target.value)} autoFocus/>
            <FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel>Cliente</InputLabel>
              <Select value={selectedClientId} label="Cliente" onChange={e => setSelectedClientId(e.target.value)} MenuProps={{ PaperProps: { style: { maxHeight: 200 } } }}>
                {clients.filter(c => c.name?.toLowerCase().includes(search.toLowerCase())).map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <TextField label="Data" type="date" fullWidth required value={date} onChange={e => { setDate(e.target.value); if(currentProfessionalId) fetchCustomSlotsForDayModal(currentProfessionalId, e.target.value); }} InputLabelProps={{ shrink: true }} inputRef={dateInputRef}/>
              <IconButton sx={{ ml: 1 }} onClick={() => dateInputRef.current?.showPicker()} color="primary"><CalendarTodayIcon /></IconButton>
            </Box>
            {selectedClientId && activePackages.length > 0 && (
              <FormControl fullWidth sx={{ mb: 2 }}> <InputLabel>Pacote</InputLabel>
                <Select value={selectedPackageId} label="Pacote" onChange={e => setSelectedPackageId(e.target.value)}>
                  <MenuItem value=""><em>Avulsa / Nenhum</em></MenuItem>
                  {activePackages.map(pkg => (<MenuItem key={pkg.id} value={pkg.id}>{pkg.package_name} ({pkg.sessions_used || 0}/{pkg.total_sessions})</MenuItem>))}
                </Select>
              </FormControl>
            )}
             {selectedClientId && !selectedPackageId && (<FormControlLabel control={<Checkbox checked={isAvulsa} onChange={e => setIsAvulsa(e.target.checked)}/>} label="Sessão Avulsa" sx={{ mb: 1, display:'block', textAlign:'right' }}/>)}
            <Button variant="outlined" size="small" color="secondary" sx={{ mb: 1, fontSize:'0.75rem' }} onClick={() => setShowCustomHourForm(v => !v)}>{showCustomHourForm ? "Fechar Hor. Pers." : "Criar Hor. Pers."}</Button>
            {showCustomHourForm && (
              <Paper variant="outlined" sx={{ mb: 2, p: 1.5, bgcolor: "grey.50" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb:1 }}>
                  <TextField label="Novo (HH:MM)" type="time" size="small" value={customHourInput} onChange={e => setCustomHourInput(e.target.value)} sx={{width:120}} inputProps={{ step: 300 }} />
                  <Button variant="contained" size="small" onClick={handleAddCustomHour} disabled={!customHourInput || loading}>Add</Button>
                </Box>
                {customHoursForDayDisplayModal.length > 0 ? customHoursForDayDisplayModal.map(h => (
                  <Box key={h} sx={{ display: "inline-flex", alignItems: "center", mr:1, mb:0.5, p:0.5, borderRadius:1, bgcolor:'grey.200' }}>
                    <Typography variant="body2" sx={{ mr: 0.5 }}>{h}</Typography>
                    <IconButton size="small" color="error" onClick={() => handleRemoveCustomHour(h)} sx={{p:0.2}} disabled={loading}><CancelIcon fontSize="inherit" /></IconButton>
                  </Box>
                )) : <Typography variant="caption" color="textSecondary">Nenhum horário personalizado para {formatDateAndWeekday(date).dateFormatted}.</Typography>}
              </Paper>
            )}
             <FormControl fullWidth sx={{ mb: 2 }} required> <InputLabel>Período</InputLabel>
              <Select value={selectedPeriod} label="Período" onChange={e => setSelectedPeriod(e.target.value)} disabled={!!selectedPackageId && !!selectedClient?.packages.find(cp => cp.id === selectedPackageId)?.package_definition?.session_duration_text}>
                {PERIODOS.map(p => (<MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>))}
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mb: 2 }} required> <InputLabel>Horário</InputLabel>
              <Select value={selectedHour} label="Horário" onChange={e => setSelectedHour(e.target.value)} MenuProps={{ PaperProps: { style: { maxHeight: 200 } } }} disabled={!selectedPeriod || loading}>
                {!selectedPeriod ? <MenuItem value="" disabled>Selecione período</MenuItem> : horariosLivres.length === 0 ? <MenuItem value="" disabled>Nenhum horário disponível</MenuItem> : horariosLivres.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Terapia/Observação" fullWidth sx={{ mb: 2 }} value={terapia} onChange={e => setTerapia(e.target.value)} placeholder="Ex: Massagem Relaxante"/>
            <Button variant="contained" color="primary" fullWidth onClick={agendarSessao} disabled={loading}>Agendar</Button>
          </Box>
        </DialogContent>
      </Dialog>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Sessões Agendadas ({agendadas.length})</Typography>
        <TableContainer component={Paper} sx={{ maxHeight: 400, overflowY: 'auto' }}><Table size="small" stickyHeader><TableHead><TableRow>
            <TableCell>Cliente</TableCell><TableCell>Data</TableCell><TableCell>Hora</TableCell><TableCell>Período</TableCell><TableCell>Terapia</TableCell><TableCell>Pacote</TableCell><TableCell>Ações</TableCell>
        </TableRow></TableHead><TableBody>
            {agendadas.sort((a,b) => new Date(a.session_date + 'T' + a.session_time) - new Date(b.session_date + 'T' + b.session_time)).map(s => (
            <TableRow key={s.id} hover>
                <TableCell>{s.client_name || clients.find(c=>c.id === s.client_id)?.name}</TableCell>
                <TableCell>{formatDateAndWeekday(s.session_date).dateFormatted}</TableCell>
                <TableCell>{s.session_time}</TableCell><TableCell>{s.duration_period}</TableCell><TableCell>{s.therapy_type}</TableCell>
                <TableCell>{s.client_package_id ? `${s.package_name || 'Pacote'} (${getPackageSessionText(s).replace(/^Sessão: /, '') || 'N/A'})` : (s.is_avulsa ? "Avulsa" : "-")}</TableCell>
                <TableCell>
                <Tooltip title="Marcar como Realizada"><IconButton color="success" size="small" onClick={() => marcarComoRealizada(s)} disabled={loading || chatLoading}><CheckCircleIcon /></IconButton></Tooltip>
                <Tooltip title="Desmarcar/Cancelar"><IconButton color="error" size="small" onClick={() => desmarcarSessao(s.id)} disabled={loading || chatLoading}><CancelIcon /></IconButton></Tooltip>
                </TableCell>
            </TableRow>))}
            {agendadas.length === 0 && <TableRow><TableCell colSpan={7} align="center">Nenhuma sessão agendada.</TableCell></TableRow>}
        </TableBody></Table></TableContainer>
      </Box>
      
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Confirmar Sessões ({confirmar.length})</Typography>
        <TableContainer component={Paper} sx={{ maxHeight: 400, overflowY: 'auto' }}><Table size="small" stickyHeader><TableHead><TableRow><TableCell>Cliente</TableCell><TableCell>Data</TableCell><TableCell>Hora</TableCell><TableCell>Contato</TableCell><TableCell>Ações</TableCell></TableRow></TableHead><TableBody>
            {confirmar.sort((a,b) => new Date(a.session_date + 'T' + a.session_time) - new Date(b.session_date + 'T' + b.session_time)).map(s => (
            <TableRow key={s.id} hover>
                <TableCell>{s.client_name || clients.find(c=>c.id === s.client_id)?.name}</TableCell>
                <TableCell>{formatDateAndWeekday(s.session_date).dateFormatted}</TableCell><TableCell>{s.session_time}</TableCell>
                <TableCell><Tooltip title="Abrir WhatsApp"><IconButton color="success" size="small" onClick={() => handleOpenWhatsapp(s)}><WhatsAppIcon /></IconButton></Tooltip></TableCell>
                <TableCell>
                <Tooltip title="Marcar como Confirmada"><IconButton color="primary" size="small" onClick={() => marcarComoConfirmadaCliente(s.id)} disabled={loading || chatLoading}><CheckCircleIcon /></IconButton></Tooltip>
                <Tooltip title="Copiar Msg Confirmação"><IconButton color="secondary" size="small" onClick={() => handleCopyMensagem(s, 1)}><ContentCopyIcon /></IconButton></Tooltip>
                <Tooltip title="Copiar Msg Lembrete"><IconButton color="info" size="small" onClick={() => handleCopyMensagem(s, 2)}><ContentCopyIcon /></IconButton></Tooltip>
                </TableCell>
            </TableRow>))}
            {confirmar.length === 0 && <TableRow><TableCell colSpan={5} align="center">Nenhuma sessão para confirmar.</TableCell></TableRow>}
        </TableBody></Table></TableContainer>
      </Box>

      <Box sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}><Typography variant="h6">Sessões Realizadas ({realizadas.length})</Typography><IconButton onClick={() => setShowRealizadas(v => !v)}><Tooltip title={showRealizadas ? "Ocultar" : "Mostrar"}>{showRealizadas ? <VisibilityOffIcon /> : <VisibilityIcon />}</Tooltip></IconButton></Box>
        <Collapse in={showRealizadas}><TableContainer component={Paper} sx={{ maxHeight: 400, overflowY: 'auto' }}><Table size="small" stickyHeader><TableHead><TableRow><TableCell>Cliente</TableCell><TableCell>Data</TableCell><TableCell>Hora</TableCell><TableCell>Pacote</TableCell><TableCell>Ações</TableCell></TableRow></TableHead><TableBody>
            {realizadas.sort((a,b) => new Date(b.session_date + 'T' + b.session_time) - new Date(a.session_date + 'T' + a.session_time)).map(s => (
            <TableRow key={s.id} hover>
                <TableCell>{s.client_name || clients.find(c=>c.id === s.client_id)?.name}</TableCell>
                <TableCell>{formatDateAndWeekday(s.session_date).dateFormatted}</TableCell><TableCell>{s.session_time}</TableCell>
                <TableCell>{s.client_package_id ? `${s.package_name || 'Pacote'} (${getPackageSessionText(s).replace(/^Sessão: /, '') || 'N/A'})` : (s.is_avulsa ? "Avulsa" : "-")}</TableCell>
                <TableCell><Tooltip title="Remover dos Realizados (Atenção: Isso não reverte o uso da sessão no pacote automaticamente aqui. Apenas remove da lista de visualização de 'realizadas' se o status for alterado para 'scheduled' por exemplo. Para estornar sessão de pacote, cancele a sessão.)"><IconButton color="error" size="small" onClick={() => desmarcarSessao(s.id)} disabled={loading || chatLoading}><DeleteIcon /></IconButton></Tooltip></TableCell>
            </TableRow>))}
            {realizadas.length === 0 && <TableRow><TableCell colSpan={5} align="center">Nenhuma sessão realizada.</TableCell></TableRow>}
        </TableBody></Table></TableContainer></Collapse>
      </Box>

      {snackbar && (<Box sx={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", bgcolor: "background.paper", color: "text.primary", px: 2, py: 1, borderRadius: 1, boxShadow: 6, zIndex: 1301 }}><Typography>{snackbar}</Typography></Box>)}
    </Box>
  );
}