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

// --- Lógica de horários livres adaptada do original para usar dados do Supabase ---
// Esta função espelha a lógica original fornecida no prompt.
// Os bloqueios (currentDayBlockedSlots) afetam primariamente o startExpediente.
// Conflitos internos em fillSlots... são checados apenas contra daySessions.
const getAvailableTimesOriginalLogicAdapted = ({
  targetDate,                     // Data alvo (string YYYY-MM-DD)
  currentDaySessionsFromSupabase, // Sessões do Supabase para o dia/profissional (objetos originais)
  period = "1h",                  // Período da sessão desejada
  minDurationParam,               // Duração em minutos (pode ser passada ou calculada)
  interval = 15,                  // Intervalo entre slots
  currentDayBlockedSlots,         // Bloqueios do Supabase para o dia/profissional (objetos originais)
  currentDayCustomSlots           // Horários customizados (array de strings "HH:MM")
}) => {
  if (!targetDate) return [];
  const dow = new Date(targetDate + "T00:00:00").getDay();
  if (dow === 0) return []; // Domingo fechado

  const minDuration = minDurationParam || getMinutesFromPeriod(period);

  let startExpediente = 8 * 60; // 08:00 em minutos
  // Lógica original de startExpediente: se há bloqueios, startExpediente é o fim do bloqueio que termina mais tarde.
  if (currentDayBlockedSlots && currentDayBlockedSlots.length > 0) {
    const endTimes = currentDayBlockedSlots.map(b => timeToMinutes(b.end_time));
    if (endTimes.length > 0) {
        // Esta linha replica: startExpediente = Math.max(...bloqueiosDia.map(b => timeToMinutes(b.horaFim)));
        // Se todos os endTimes forem menores que 8*60, startExpediente se tornaria menor, o que não é a intenção.
        // A intenção original era provavelmente empurrar o startExpediente se um bloqueio o cobrisse.
        // No entanto, para ser fiel ao `Math.max` literal do prompt:
        startExpediente = Math.max(...endTimes);
        // Para segurança, garantir que não seja antes do horário de abertura padrão:
        if (startExpediente < 8 * 60 && currentDayBlockedSlots.some(b => timeToMinutes(b.end_time) >= 8*60)) {
            // Se algum bloqueio termina depois das 8h, e o max é antes das 8h (improvável com Math.max),
            // ou se o max é o que queremos.
            // A lógica original do prompt é `startExpediente = Math.max(...fimBloqueios)`.
            // Se o dia não tem bloqueios que afetem o início, mas tem um bloqueio 18-19h,
            // startExpediente se tornaria 19h. Isso é o que a lógica original faria.
        } else if (currentDayBlockedSlots.length > 0 && Math.max(...endTimes) < 8*60) {
            // Se o bloqueio que termina mais tarde ainda é antes das 8h, o expediente começa às 8h.
            startExpediente = 8 * 60;
        }
    }
  }
  const endExpediente = dow === 6 ? 16 * 60 + 10 : 20 * 60 + 10; // Sábado até 16:10, outros dias até 20:10

  // Mapear sessões do Supabase para o formato esperado por daySessions na lógica original
  const daySessions = currentDaySessionsFromSupabase
    .filter(s => s.session_date === targetDate && (s.status === "scheduled" || s.status === "done" || s.status === "confirmed"))
    .map(s => ({
      // Preservar campos originais se a lógica interna precisar (ex: s.time para customSlotsWithSession)
      id: s.id, 
      time: s.session_time, // HH:MM string
      period: s.duration_period,
      // Campos calculados para a lógica de conflito
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
    // O slot livre que estamos procurando deve terminar 'interval' minutos antes do 'markedTime'.
const endOfPotentialSlot = markedTime - interval;
    // O início desse slot livre é 'minDuration' minutos antes do seu fim.
     let startOfPotentialSlot = endOfPotentialSlot - minDuration;

    // Iterar enquanto o início do slot livre potencial for igual ou maior que o início do expediente.
    while (startOfPotentialSlot >= startExpediente) {
      const currentSlotEndTime = startOfPotentialSlot + minDuration; // Fim do slot livre atual

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

  // --- Lógica de preenchimento principal modificada ---
  if (firstMarked !== null && firstMarked > startExpediente) {
    // CASO PIVÔ: Existe um 'firstMarked' (de custom slot com sessão OU de sessão normal)
    // e ele é depois do início do expediente.
    // Esta é a lógica que você considera 100% correta.

    fillSlotsBeforeMarked(firstMarked); // Preenche ANTES do pivô
      
    // Lógica para preencher *depois* de firstMarked (exatamente como no seu bloco 'if' original)
    let lastProcessedEndTime = firstMarked; 
    const firstMarkedIsSession = daySessions.find(s => s.start === firstMarked);
    if (firstMarkedIsSession) {
        lastProcessedEndTime = firstMarkedIsSession.end;
    } else { 
        // Fallback se firstMarked (provavelmente de um customSlotWithSession)
        // não encontrar uma sessão correspondente em daySessions por s.start.
        // Isso pode indicar uma pequena inconsistência ou um custom slot sem sessão real mapeada para s.start.
        const sessionAtFirstMarked = daySessions.find(s => s.start === firstMarked); // Re-check
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
    // CASO SEM PIVÔ VÁLIDO ou PIVÔ MUITO CEDO:
    // (firstMarked é null OU firstMarked <= startExpediente)
    // Esta é a lógica que estava no seu 'else' original e no 'if (daySessions.length === 0)'
    
    if (daySessions.length === 0) {
      // Se não há sessões (e não houve pivô válido), preenche todo o expediente.
      fillSlotsInInterval(startExpediente, endExpediente);
    } else {
      // Há sessões, mas não formaram um pivô para preenchimento retroativo.
      // Preenche antes da primeira sessão (se houver espaço), entre sessões, e depois da última.
      // (Esta é a lógica do seu 'else' original)
      if (daySessions[0].start >= startExpediente + interval) {
        fillSlotsInInterval(startExpediente, daySessions[0].start - interval);
      }
      // else if (daySessions.length === 0 && customSlotsRaw.length === 0) { /* Redundante aqui */ }

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
  // --- Fim da lógica de preenchimento principal modificada ---

  // Adiciona horários personalizados (customSlotsRaw) se não conflitarem (lógica original do prompt)
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


export default function Agendamentos() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState("");

  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [professionals, setProfessionals] = useState([]); 
  const [sessions, setSessions] = useState([]); 
  const [allCustomSlotsForProfessional, setAllCustomSlotsForProfessional] = useState([]); // Todos os custom slots do profissional
  const [allBlockedSlotsForProfessional, setAllBlockedSlotsForProfessional] = useState([]); // Todos os bloqueios do profissional

  const [selectedClientId, setSelectedClientId] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedPeriod, setSelectedPeriod] = useState("1h"); // Padrão
  const [terapia, setTerapia] = useState("Massagem");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedHour, setSelectedHour] = useState("");
  const [showRealizadas, setShowRealizadas] = useState(true);
  const [isAvulsa, setIsAvulsa] = useState(true);
  
  const [currentProfessionalId, setCurrentProfessionalId] = useState(null); 
  
  const [showCustomHourForm, setShowCustomHourForm] = useState(false);
  const [customHourInput, setCustomHourInput] = useState(""); 
  const [customHoursForDayDisplayModal, setCustomHoursForDayDisplayModal] = useState([]); 

  const dateInputRef = useRef();
  // const [selectedDayForCopy, setSelectedDayForCopy] = useState(() => new Date().toISOString().slice(0, 10));


   const fetchClients = useCallback(async () => {
    const { data, error: fetchError } = await supabase.from('clients').select(`
      id, 
      name, 
      phone, 
      packages:client_packages(
        id, 
        package_id, 
        package_name, 
        total_sessions, 
        sessions_used, 
        validity_date, 
        status,
        package_definition:packages(session_duration_text)
      )
    `);
    if (fetchError) {
      console.error("Error fetching clients with package definitions:", fetchError);
      // It's good to also set an error state here if this fetch is critical
      // setError(fetchError.message); // Example
      throw fetchError; // Re-throw if you want calling code to handle
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
  }, [currentProfessionalId]); // Adicionado currentProfessionalId como dependência

  const fetchSessionsForProfessional = useCallback(async (professionalId) => {
    if (!professionalId) return;
    const { data, error: fetchError } = await supabase
      .from('sessions')
      .select('*') // Selecionar tudo, joins podem ser feitos no client se necessário ou otimizar query
      .eq('professional_id', professionalId);
    if (fetchError) throw fetchError;
    setSessions(data || []);
  }, []);

  const fetchAllCustomSlotsForProfessional = useCallback(async (professionalId) => {
    if (!professionalId) return;
    const { data, error: fetchError } = await supabase.from('custom_slots').select('*').eq('professional_id', professionalId);
    if (fetchError) throw fetchError;
    setAllCustomSlotsForProfessional(data || []);
  }, []);
  
  const fetchCustomSlotsForDayModal = useCallback(async (professionalId, targetDate) => {
    if (!professionalId || !targetDate) {
      setCustomHoursForDayDisplayModal([]);
      return;
    }
    const { data, error: fetchError } = await supabase
      .from('custom_slots')
      .select('slot_time')
      .eq('professional_id', professionalId)
      .eq('slot_date', targetDate);
    if (fetchError) throw fetchError;
    setCustomHoursForDayDisplayModal(data.map(s => s.slot_time).sort() || []);
  }, []);


  const fetchAllBlockedSlotsForProfessional = useCallback(async (professionalId) => {
    if (!professionalId) return;
    const { data, error: fetchError } = await supabase.from('blocked_slots').select('*').eq('professional_id', professionalId);
    if (fetchError) throw fetchError;
    setAllBlockedSlotsForProfessional(data || []);
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      setError(null);
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
    if (supabase) {
        loadInitialData();
    }
  }, [fetchClients, fetchProfessionals]);

  useEffect(() => {
    if (currentProfessionalId && supabase) {
      setLoading(true);
      Promise.all([
        fetchSessionsForProfessional(currentProfessionalId),
        fetchAllCustomSlotsForProfessional(currentProfessionalId),
        fetchAllBlockedSlotsForProfessional(currentProfessionalId),
        fetchCustomSlotsForDayModal(currentProfessionalId, date) // Para o modal, usa a data do modal
      ]).catch(e => {
        console.error("Erro ao carregar dados do profissional:", e);
        setError(e.message);
      }).finally(() => setLoading(false));
    }
  }, [currentProfessionalId, date, fetchSessionsForProfessional, fetchAllCustomSlotsForProfessional, fetchAllBlockedSlotsForProfessional, fetchCustomSlotsForDayModal]);


  const selectedClient = useMemo(
    () => clients.find(c => c.id === selectedClientId),
    [clients, selectedClientId]
  );

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
    setSelectedPackageId(""); // Reset previous package selection
    // Não resetar selectedPeriod aqui, pode ser útil manter para avulsas

    // Auto-selecionar o primeiro pacote ativo do cliente, se houver
    // selectedClient e activePackages são recalculados quando selectedClientId muda.
    if (selectedClient && activePackages.length > 0) {
      setSelectedPackageId(activePackages[0].id);
    }
  }, [selectedClientId, selectedClient, activePackages]); // Adicionado selectedClient e activePackages

 useEffect(() => {
    if (!selectedPackageId) {
      setIsAvulsa(true); // Se nenhum pacote, é avulsa por padrão
      // Não alteramos selectedPeriod aqui, permitindo que o usuário escolha ou um padrão seja mantido.
      return;
    }

    setIsAvulsa(false);
    const clientPackageDetails = selectedClient?.packages.find(cp => cp.id === selectedPackageId);
    
    console.log("Detalhes do Pacote do Cliente Selecionado:", clientPackageDetails); // LOG 1

    // Tenta obter duration_period da definição do pacote aninhada (package_definition)
    const durationFromPackageDef = clientPackageDetails?.package_definition?.session_duration_text;
    
    console.log("Duração Obtida da Definição do Pacote (durationFromPackageDef):", durationFromPackageDef); // LOG 2
    
    let newPeriod = "1h"; // Default fallback

    if (durationFromPackageDef) {
      const foundPeriod = PERIODOS.find(p => p.value === durationFromPackageDef);
      console.log("Período Encontrado na lista PERIODOS:", foundPeriod); // LOG 3
      if (foundPeriod) {
        newPeriod = durationFromPackageDef;
      } else {
        console.warn(`Período "${durationFromPackageDef}" do pacote ID ${selectedPackageId} (package_id: ${clientPackageDetails?.package_id}) não é um valor válido na lista PERIODOS. Usando fallback "1h". Verifique a coluna 'session_duration_text' na tabela 'packages'. Valores válidos em PERIODOS são: ${PERIODOS.map(p=>p.value).join(', ')}`);
      }
    } else {
      console.warn(`session_duration_text não encontrado em package_definition para o pacote ID ${selectedPackageId}. clientPackageDetails.package_definition:`, clientPackageDetails?.package_definition);
    }
    
    console.log("Período que será definido (newPeriod):", newPeriod); // LOG 4
    // Apenas atualiza se o período for diferente para evitar loops desnecessários
    setSelectedPeriod(currentPeriod => {
      if (currentPeriod !== newPeriod) {
        console.log(`Atualizando selectedPeriod de "${currentPeriod}" para "${newPeriod}"`); // LOG 5
        return newPeriod;
      }
      return currentPeriod;
    });

  }, [selectedPackageId, selectedClient]); // selectedPeriod foi removido das dependências para evitar loops


  const agendarSessao = async () => {
    if (!selectedClientId || !date || !selectedPeriod || !terapia || !selectedHour || !currentProfessionalId) {
      setSnackbar("Preencha todos os campos obrigatórios.");
      setTimeout(() => setSnackbar(""), 3000);
      return;
    }
    setLoading(true);
    setError(null);

    const cliente = clients.find(c => c.id === selectedClientId);
    const pacoteDoCliente = selectedPackageId ? activePackages.find(p => p.id === selectedPackageId) : null;

    const novaSessaoData = {
      client_id: selectedClientId,
      client_name: cliente?.name || "N/A",
      client_package_id: pacoteDoCliente ? pacoteDoCliente.id : null, // MODIFICADO AQUI
      package_name: pacoteDoCliente ? pacoteDoCliente.package_name : null, 
      professional_id: currentProfessionalId,
      session_date: date,
      session_time: selectedHour,
      duration_period: selectedPeriod,
      therapy_type: terapia,
      status: "scheduled",
      is_avulsa: !pacoteDoCliente, 
      is_confirmed_by_client: false,
    };

    const { data: insertedSession, error: insertError } = await supabase
      .from('sessions')
      .insert(novaSessaoData)
      .select()
      .single();

    if (insertError) {
      console.error("Erro ao agendar sessão:", insertError);
      setError(`Erro ao agendar: ${insertError.message}`);
      setLoading(false);
      return;
    }

    if (insertedSession) {
        setSessions(prev => [...prev, insertedSession].sort((a,b) => new Date(a.session_date + 'T' + a.session_time) - new Date(b.session_date + 'T' + b.session_time)));
        if (pacoteDoCliente) {
            const newSessionsUsed = (pacoteDoCliente.sessions_used || 0) + 1;
            const { error: updatePackageError } = await supabase
                .from('client_packages')
                .update({ sessions_used: newSessionsUsed })
                .eq('id', pacoteDoCliente.id);
            if (updatePackageError) {
                console.error("Erro ao atualizar sessões usadas:", updatePackageError);
                setError("Sessão agendada, mas falha ao atualizar pacote.");
            } else {
                await fetchClients(); 
            }
        }
    }
    
    setOpen(false);
    setSelectedClientId("");
    setSelectedPackageId("");
    setSelectedHour("");
    setTerapia("Massagem");
    setIsAvulsa(true);
    setSnackbar("Sessão agendada!");
    setLoading(false);
    setTimeout(() => setSnackbar(""), 3000);
  };

  const marcarComoRealizada = async (sessao) => {
    setLoading(true); setError(null);
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ status: 'done' })
      .eq('id', sessao.id);

    if (updateError) {
      console.error("Erro ao marcar como realizada:", updateError);
      setError(updateError.message);
    } else {
      setSessions(prev => prev.map(s => s.id === sessao.id ? { ...s, status: 'done' } : s));
      setSnackbar("Sessão marcada como realizada!");
      // Lógica de `sessions_used` já é tratada no agendamento.
      // Se uma sessão avulsa se torna 'done', não afeta pacotes.
    }
    setLoading(false);
    setTimeout(() => setSnackbar(""), 3000);
  };

  const desmarcarSessao = async (sessaoId) => {
    setLoading(true); setError(null);
    const sessaoParaCancelar = sessions.find(s => s.id === sessaoId);

    if (!sessaoParaCancelar) {
        setError("Sessão não encontrada para cancelar.");
        setLoading(false);
        return;
    }

    const { error: deleteError } = await supabase.from('sessions').delete().eq('id', sessaoId);

    if (deleteError) {
      console.error("Erro ao desmarcar sessão:", deleteError);
      setError(deleteError.message);
    } else {
      setSessions(prev => prev.filter(s => s.id !== sessaoId));
      setSnackbar("Sessão removida!");

      // USA client_package_id AQUI
      if (sessaoParaCancelar.client_package_id && sessaoParaCancelar.status !== 'cancelled_by_client' && sessaoParaCancelar.status !== 'cancelled_by_professional') {
        const clientPackage = clients.find(c => c.id === sessaoParaCancelar.client_id)
                                ?.packages.find(p => p.id === sessaoParaCancelar.client_package_id); // E AQUI
        if (clientPackage && (clientPackage.sessions_used || 0) > 0) {
          const newSessionsUsed = clientPackage.sessions_used - 1;
          const { error: updatePackageError } = await supabase
            .from('client_packages')
            .update({ sessions_used: newSessionsUsed })
            .eq('id', clientPackage.id);
          if (updatePackageError) {
            console.error("Erro ao decrementar sessões usadas:", updatePackageError);
            setError("Sessão removida, mas falha ao atualizar pacote.");
          } else {
            await fetchClients(); 
          }
        }
      }
    }
    setLoading(false);
    setTimeout(() => setSnackbar(""), 3000);
  };
  
  const marcarComoConfirmadaCliente = async (sessaoId) => {
    setLoading(true); setError(null);
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ is_confirmed_by_client: true }) // Apenas atualiza is_confirmed_by_client
      .eq('id', sessaoId);
    if (updateError) {
        console.error("Erro ao confirmar sessão:", updateError);
        setError(updateError.message);
    } else {
        setSessions(prev => prev.map(s => s.id === sessaoId ? { ...s, is_confirmed_by_client: true } : s)); // Apenas atualiza is_confirmed_by_client no estado local
        setSnackbar("Sessão confirmada pelo cliente!");
    }
    setLoading(false);
    setTimeout(() => setSnackbar(""), 3000);
  };

  const handleAddCustomHour = async () => {
    if (!customHourInput.match(/^\d{2}:\d{2}$/)) {
      setSnackbar("Formato de hora inválido (HH:MM)"); setTimeout(() => setSnackbar(""), 3000); return;
    }
    if (customHoursForDayDisplayModal.includes(customHourInput)) {
      setSnackbar("Horário já existe para este dia."); setTimeout(() => setSnackbar(""), 3000); return;
    }
    setLoading(true); setError(null);
    const { error: insertError } = await supabase
      .from('custom_slots')
      .insert({ professional_id: currentProfessionalId, slot_date: date, slot_time: customHourInput });
    if (insertError) {
      setError(insertError.message);
    } else {
      await fetchAllCustomSlotsForProfessional(currentProfessionalId); // Atualiza a lista geral
      await fetchCustomSlotsForDayModal(currentProfessionalId, date); // Atualiza a lista do modal
      setCustomHourInput("");
      setSnackbar("Horário personalizado adicionado.");
    }
    setLoading(false);
    setTimeout(() => setSnackbar(""), 3000);
  };

  const handleRemoveCustomHour = async (hourToRemove) => {
    setLoading(true); setError(null);
    const { error: deleteError } = await supabase
      .from('custom_slots')
      .delete()
      .eq('professional_id', currentProfessionalId)
      .eq('slot_date', date)
      .eq('slot_time', hourToRemove);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      await fetchAllCustomSlotsForProfessional(currentProfessionalId);
      await fetchCustomSlotsForDayModal(currentProfessionalId, date);
      setSnackbar("Horário personalizado removido.");
    }
    setLoading(false);
    setTimeout(() => setSnackbar(""), 3000);
  };
  
  const horariosLivres = useMemo(() => {
    if (!date || !selectedPeriod || !currentProfessionalId || loading) return [];

    // Sessões do Supabase para o dia e profissional (objetos completos)
    const currentDaySessionsFromSupabase = sessions.filter(s => 
        s.session_date === date && 
        s.professional_id === currentProfessionalId &&
        (s.status === "scheduled" || s.status === "done" || s.status === "confirmed") // Filtro de status relevante
    );
    
    // Horários customizados para o dia e profissional (array de "HH:MM")
    const currentDayCustomSlots = allCustomSlotsForProfessional
        .filter(cs => cs.slot_date === date && cs.professional_id === currentProfessionalId)
        .map(cs => cs.slot_time);

    // Bloqueios para o dia e profissional (objetos completos)
    const currentDayBlockedSlots = allBlockedSlotsForProfessional
        .filter(bs => bs.block_date === date && bs.professional_id === currentProfessionalId);

    return getAvailableTimesOriginalLogicAdapted({
      targetDate: date,
      currentDaySessionsFromSupabase: currentDaySessionsFromSupabase,
      period: selectedPeriod,
      minDurationParam: getMinutesFromPeriod(selectedPeriod),
      interval: 15, 
      currentDayBlockedSlots: currentDayBlockedSlots,
      currentDayCustomSlots: currentDayCustomSlots
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
    
    if (!clientPackage) {
      // Fallback se o clientPackage não for encontrado nos dados do cliente.
      return `Sessão: ?/${sessaoAlvo.package_name ? '?' : (clientPackage?.total_sessions || 'N/A')}`;
    }

    // 1. Filtrar todas as sessões (do estado 'sessions') pertencentes a este client_package específico
    const sessoesDoPacote = sessions
        .filter(s => s.client_package_id === sessaoAlvo.client_package_id)
        .sort((a, b) => { // 2. Ordenar cronologicamente
            const dateA = new Date(`${a.session_date}T${a.session_time || '00:00:00'}`);
            const dateB = new Date(`${b.session_date}T${b.session_time || '00:00:00'}`);
            if (dateA.getTime() !== dateB.getTime()) { 
                return dateA.getTime() - dateB.getTime();
            }
            // Se mesma data e hora, usar ID para uma ordem estável (desempate)
            return a.id.localeCompare(b.id);
        });
        
    // 3. Encontrar o índice (0-based) da sessão alvo na lista ordenada
    let chronologicalIndexInView = -1; 
    for (let i = 0; i < sessoesDoPacote.length; i++) {
        if (sessoesDoPacote[i].id === sessaoAlvo.id) {
            chronologicalIndexInView = i;
            break;
        }
    }

    if (chronologicalIndexInView === -1) {
        // Isso pode acontecer se a sessaoAlvo não estiver na lista 'sessions' do estado
        // ou se houver alguma inconsistência de ID.
        console.warn("getPackageSessionText: sessaoAlvo não encontrada na lista ordenada de sessoesDoPacote.", { sessaoAlvo, sessoesDoPacote });
        // Fallback: usa o sessions_used total se a sessão específica não for encontrada na lista local,
        // ou um '?' se sessions_used não estiver disponível.
        return `Sessão: ${clientPackage.sessions_used || '?'}/${clientPackage.total_sessions || 'N/A'}`;
    }
    
    // Calcular o número da sessão "X"
    // clientPackage.sessions_used é o total de sessões usadas para este pacote.
    // sessoesDoPacote.length é o número de sessões deste pacote que estão atualmente na lista 'sessions'.
    // chronologicalIndexInView é a posição 0-indexada da sessão atual dentro de 'sessoesDoPacote'.
    const numeroDaSessaoAtual = (clientPackage.sessions_used || 0) - sessoesDoPacote.length + (chronologicalIndexInView + 1);
    
    // "Y" (totalSessoes) virá de clientPackage.total_sessions
    const totalSessoes = clientPackage.total_sessions || 'N/A';
    
    // Garante que o número da sessão não seja <= 0 em caso de inconsistências de dados
    // (ex: se sessions_used for menor que o número de sessões visíveis)
    const finalNumeroDaSessao = Math.max(1, numeroDaSessaoAtual);

    return `Sessão: ${finalNumeroDaSessao}/${totalSessoes}`;
  }, [clients, sessions]); // Adicionado 'sessions' como dependência

  const getProfissionalLabel = useCallback((professionalId) => {
    const found = professionals.find(p => p.id === professionalId);
    return found ? found.name : 'N/A';
  }, [professionals]);

  function getMensagemConfirmacao(sessao) {
    const { weekday, dateFormatted } = formatDateAndWeekday(sessao.session_date);
    const terapeutaLabel = getProfissionalLabel(sessao.professional_id);
    const formattedTime = sessao.session_time ? sessao.session_time.substring(0, 5) : "-"; // Formata para HH:MM
    let msg = `Segue a confirmação do seu agendamento:
Terapia: ${sessao.therapy_type || "-"} | ${sessao.duration_period || "-"}
Data: ${weekday} (${dateFormatted})
Horário: ${formattedTime}`; // Usa a hora formatada
    if (sessao.client_package_id) { // MODIFICADO AQUI
      msg += `\n${getPackageSessionText(sessao)}`;
    }
    msg += `
Terapeuta: ${terapeutaLabel}
Le Renovare | Open Mall The Square- Sala 424 | Bloco E- Ao lado do carrefour 
Rod. Raposo Tavares, KM 22

🙏🏼🍃✨`;
    return msg;
  }

   function getMensagemLembrete(sessao) {
    const { weekday, dateFormatted } = formatDateAndWeekday(sessao.session_date);
    const formattedTime = sessao.session_time ? sessao.session_time.substring(0, 5) : "-"; // Formata para HH:MM
    return `Oii, aqui é a Lari e estou ajudando a Lê com a agenda de atendimentos🍃✨

Passando para confirmar sua sessão:
Dia: ${weekday}${dateFormatted ? ` (${dateFormatted})` : ""}
Horário: ${formattedTime}
Local: Le Renovare | Open Mall The Square- Sala 424 | Bloco E- Ao lado do carrefour 

Posso confirmar? Aguardamos seu retorno.💆🏼‍♀️💖`;
  }
  
  function handleCopyMensagem(sessao, tipo) {
// ...existing code...
    const msg = tipo === 1 ? getMensagemConfirmacao(sessao) : getMensagemLembrete(sessao);
    navigator.clipboard.writeText(msg).then(() => {
        setSnackbar(`Mensagem ${tipo} copiada!`);
    }).catch(err => {
        setSnackbar(`Erro ao copiar: ${err.message}`);
    });
    setTimeout(() => setSnackbar(""), 3000);
  }

  function handleOpenWhatsapp(sessao) {
    const client = clients.find(c => c.id === sessao.client_id);
    if (!client || !client.phone) {
        setSnackbar("Telefone do cliente não encontrado."); setTimeout(() => setSnackbar(""), 3000); return;
    }
    let num = client.phone.replace(/\D/g, "");
    if (num.length === 10 || num.length === 11) num = "55" + num; // Adiciona 55 se não tiver
    else if (num.length === 12 || num.length === 13) { // Já tem DDI
        if (!num.startsWith("55")) num = "55" + num.substring(num.length - (num.length === 12 ? 10 : 11)); // Garante 55 + num local
    } else {
         setSnackbar("Número de telefone inválido."); setTimeout(() => setSnackbar(""), 3000); return;
    }
    const link = `https://wa.me/${num}`;
    window.open(link, "_blank");
  }

  if (loading && !open && professionals.length === 0) return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  if (error && !open) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;

  return (
    <>
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ mr: 2, minWidth: 'max-content'  }}>
          Profissional:
        </Typography>
        <ToggleButtonGroup
          value={currentProfessionalId}
          exclusive
          onChange={(_, value) => { if (value) setCurrentProfessionalId(value);}}
          color="primary"
          size="small"
        >
          {professionals.map(p => (
            <ToggleButton key={p.id} value={p.id} disabled={loading && currentProfessionalId !== p.id}>
              {p.name}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2, alignItems: "center", flexWrap: 'wrap' }}>
        <Button variant="contained" color="primary" onClick={() => {
            const today = new Date().toISOString().slice(0,10);
            setDate(today); 
            setSelectedClientId("");
            setSelectedPackageId("");
            setSelectedHour("");
            setTerapia("Massagem");
            setSelectedPeriod("1h"); // Resetar período ao abrir
            setIsAvulsa(true);
            if(currentProfessionalId) fetchCustomSlotsForDayModal(currentProfessionalId, today);
            setOpen(true);
        }}
        disabled={!currentProfessionalId || loading}
        >
          Agendar sessão
        </Button>
        {/* Botões de cópia de horários podem ser adicionados aqui depois */}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Agendar Sessão {currentProfessionalId ? `(${getProfissionalLabel(currentProfessionalId)})` : ''}</DialogTitle>
        <DialogContent dividers sx={{pt: 2}}>
          {(loading && open) && <CircularProgress size={24} sx={{position: 'absolute', top: '50%', left: '50%'}}/>}
          {error && <Alert severity="error" sx={{mb:1}}>{error}</Alert>}
          <Box sx={{ mt: 1, minWidth: 250, filter: (loading && open) ? 'blur(2px)' : 'none' }}>
            <TextField
              label="Buscar cliente" variant="outlined" size="small" fullWidth sx={{ mb: 2 }}
              value={search} onChange={e => setSearch(e.target.value)} autoFocus
            />
            <FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel>Cliente</InputLabel>
              <Select value={selectedClientId} label="Cliente" onChange={e => setSelectedClientId(e.target.value)} MenuProps={{ PaperProps: { style: { maxHeight: 200 } } }}>
                {clients.filter(c => c.name?.toLowerCase().includes(search.toLowerCase())).map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <TextField
                label="Data" type="date" fullWidth required value={date}
                onChange={e => { setDate(e.target.value); if(currentProfessionalId) fetchCustomSlotsForDayModal(currentProfessionalId, e.target.value); }}
                InputLabelProps={{ shrink: true }} inputRef={dateInputRef}
              />
               <IconButton sx={{ ml: 1 }} onClick={() => dateInputRef.current?.showPicker()} color="primary"><CalendarTodayIcon /></IconButton>
            </Box>

            {selectedClientId && activePackages.length > 0 && (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Pacote</InputLabel>
                <Select value={selectedPackageId} label="Pacote" onChange={e => setSelectedPackageId(e.target.value)}>
                  <MenuItem value=""><em>Avulsa / Nenhum</em></MenuItem>
                  {activePackages.map(pkg => (
                    <MenuItem key={pkg.id} value={pkg.id}>
                      {pkg.package_name} ({pkg.sessions_used || 0}/{pkg.total_sessions})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
             {selectedClientId && !selectedPackageId && (
                <FormControlLabel
                  control={<Checkbox checked={isAvulsa} onChange={e => setIsAvulsa(e.target.checked)}/>}
                  label="Sessão Avulsa" sx={{ mb: 1, display:'block', textAlign:'right' }}
                />
            )}

            <Button variant="outlined" size="small" color="secondary" sx={{ mb: 1, fontSize:'0.75rem' }} onClick={() => setShowCustomHourForm(v => !v)}>
              {showCustomHourForm ? "Fechar Hor. Pers." : "Criar Hor. Pers."}
            </Button>
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

             <FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel>Período</InputLabel>
              <Select 
                value={selectedPeriod} 
                label="Período" 
                onChange={e => setSelectedPeriod(e.target.value)} 
                disabled={
                  !!selectedPackageId && 
                  !!selectedClient?.packages.find(cp => cp.id === selectedPackageId)?.package_definition?.session_duration_text
                }
              >
                {PERIODOS.map(p => (<MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel>Horário</InputLabel>
              <Select value={selectedHour} label="Horário" onChange={e => setSelectedHour(e.target.value)} MenuProps={{ PaperProps: { style: { maxHeight: 200 } } }} disabled={!selectedPeriod || loading}>
                {!selectedPeriod ? <MenuItem value="" disabled>Selecione período</MenuItem> :
                 horariosLivres.length === 0 ? <MenuItem value="" disabled>Nenhum horário disponível</MenuItem> :
                 horariosLivres.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)
                }
              </Select>
            </FormControl>
            <TextField label="Terapia/Observação" fullWidth sx={{ mb: 2 }} value={terapia} onChange={e => setTerapia(e.target.value)} placeholder="Ex: Massagem Relaxante"/>
            <Button variant="contained" color="primary" fullWidth onClick={agendarSessao} disabled={loading}>Agendar</Button>
          </Box>
        </DialogContent>
      </Dialog>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Sessões Agendadas ({agendadas.length})</Typography>
        <TableContainer component={Paper} sx={{ maxHeight: 400, overflowY: 'auto' }}>
          <Table size="small" stickyHeader><TableHead><TableRow>
                <TableCell>Cliente</TableCell><TableCell>Data</TableCell><TableCell>Hora</TableCell>
                <TableCell>Período</TableCell><TableCell>Terapia</TableCell><TableCell>Pacote</TableCell>
                <TableCell>Ações</TableCell>
          </TableRow></TableHead>
           <TableBody>
              {agendadas.sort((a,b) => new Date(a.session_date + 'T' + a.session_time) - new Date(b.session_date + 'T' + b.session_time)).map(s => (
                <TableRow key={s.id} hover>
                  <TableCell>{s.client_name || clients.find(c=>c.id === s.client_id)?.name}</TableCell>
                  <TableCell>{formatDateAndWeekday(s.session_date).dateFormatted}</TableCell>
                  <TableCell>{s.session_time}</TableCell>
                  <TableCell>{s.duration_period}</TableCell>
                  <TableCell>{s.therapy_type}</TableCell>
                  <TableCell>
                    {s.client_package_id
                      ? `${s.package_name || 'Pacote'} (${getPackageSessionText(s).replace(/^Sessão: /, '') || 'N/A'})`
                      : (s.is_avulsa ? "Avulsa" : "-")}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Marcar como Realizada"><IconButton color="success" size="small" onClick={() => marcarComoRealizada(s)} disabled={loading}><CheckCircleIcon /></IconButton></Tooltip>
                    <Tooltip title="Desmarcar/Cancelar"><IconButton color="error" size="small" onClick={() => desmarcarSessao(s.id)} disabled={loading}><CancelIcon /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {agendadas.length === 0 && <TableRow><TableCell colSpan={7} align="center">Nenhuma sessão agendada.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
      
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Confirmar Sessões ({confirmar.length})</Typography>
        <TableContainer component={Paper} sx={{ maxHeight: 400, overflowY: 'auto' }}>
          <Table size="small" stickyHeader><TableHead><TableRow><TableCell>Cliente</TableCell><TableCell>Data</TableCell><TableCell>Hora</TableCell><TableCell>Contato</TableCell><TableCell>Ações</TableCell></TableRow></TableHead>
            <TableBody>
              {confirmar.sort((a,b) => new Date(a.session_date + 'T' + a.session_time) - new Date(b.session_date + 'T' + b.session_time)).map(s => (
                <TableRow key={s.id} hover>
                  <TableCell>{s.client_name || clients.find(c=>c.id === s.client_id)?.name}</TableCell>
                  <TableCell>{formatDateAndWeekday(s.session_date).dateFormatted}</TableCell>
                  <TableCell>{s.session_time}</TableCell>
                  <TableCell><Tooltip title="Abrir WhatsApp"><IconButton color="success" size="small" onClick={() => handleOpenWhatsapp(s)}><WhatsAppIcon /></IconButton></Tooltip></TableCell>
                  <TableCell>
                    <Tooltip title="Marcar como Confirmada"><IconButton color="primary" size="small" onClick={() => marcarComoConfirmadaCliente(s.id)} disabled={loading}><CheckCircleIcon /></IconButton></Tooltip>
                    <Tooltip title="Copiar Msg Confirmação"><IconButton color="secondary" size="small" onClick={() => handleCopyMensagem(s, 1)}><ContentCopyIcon /></IconButton></Tooltip>
                    <Tooltip title="Copiar Msg Lembrete"><IconButton color="info" size="small" onClick={() => handleCopyMensagem(s, 2)}><ContentCopyIcon /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {confirmar.length === 0 && <TableRow><TableCell colSpan={5} align="center">Nenhuma sessão para confirmar.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6">Sessões Realizadas ({realizadas.length})</Typography>
            <IconButton onClick={() => setShowRealizadas(v => !v)}><Tooltip title={showRealizadas ? "Ocultar" : "Mostrar"}>{showRealizadas ? <VisibilityOffIcon /> : <VisibilityIcon />}</Tooltip></IconButton>
        </Box>
        <Collapse in={showRealizadas}>
            <TableContainer component={Paper} sx={{ maxHeight: 400, overflowY: 'auto' }}>
            <Table size="small" stickyHeader><TableHead><TableRow><TableCell>Cliente</TableCell><TableCell>Data</TableCell><TableCell>Hora</TableCell><TableCell>Pacote</TableCell><TableCell>Ações</TableCell></TableRow></TableHead>
                <TableBody>
                {realizadas.sort((a,b) => new Date(b.session_date + 'T' + b.session_time) - new Date(a.session_date + 'T' + a.session_time)).map(s => (
                    <TableRow key={s.id} hover>
                    <TableCell>{s.client_name || clients.find(c=>c.id === s.client_id)?.name}</TableCell>
                    <TableCell>{formatDateAndWeekday(s.session_date).dateFormatted}</TableCell>
                    <TableCell>{s.session_time}</TableCell>
                    <TableCell>
                      {s.client_package_id
                        ? `${s.package_name || 'Pacote'} (${getPackageSessionText(s).replace(/^Sessão: /, '') || 'N/A'})`
                        : (s.is_avulsa ? "Avulsa" : "-")}
                    </TableCell>
                    <TableCell>
                        <Tooltip title="Remover dos Realizados (Atenção: Isso não reverte o uso da sessão no pacote automaticamente aqui. Apenas remove da lista de visualização de 'realizadas' se o status for alterado para 'scheduled' por exemplo. Para estornar sessão de pacote, cancele a sessão.)">
                            <IconButton color="error" size="small" onClick={() => desmarcarSessao(s.id)} disabled={loading}><DeleteIcon /></IconButton>
                        </Tooltip>
                    </TableCell>
                    </TableRow>
                ))}
                {realizadas.length === 0 && <TableRow><TableCell colSpan={5} align="center">Nenhuma sessão realizada.</TableCell></TableRow>}
                </TableBody>
            </Table>
            </TableContainer>
        </Collapse>
      </Box>

      {snackbar && (
        <Box sx={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", bgcolor: "background.paper", color: "text.primary", px: 2, py: 1, borderRadius: 1, boxShadow: 6, zIndex: 1301 }}>
          <Typography>{snackbar}</Typography>
        </Box>
      )}
    </>
  );
}