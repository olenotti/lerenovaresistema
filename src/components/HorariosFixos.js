import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, TextField, Checkbox,
  FormControlLabel, Snackbar, Alert, Switch, CircularProgress, Tooltip
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EditIcon from "@mui/icons-material/Edit"; // Para editar
import { format, addDays, getDay } from "date-fns";
import { supabase } from '../supabaseClient'; // Importe o cliente Supabase

// --- Constantes ---
const DIAS_SEMANA = [
  { label: "Segunda-feira", value: 1 },
  { label: "Terça-feira", value: 2 },
  { label: "Quarta-feira", value: 3 },
  { label: "Quinta-feira", value: 4 },
  { label: "Sexta-feira", value: 5 },
  { label: "Sábado", value: 6 },
];

// --- Helpers ---
// Calcula a próxima data do dia da semana a partir de hoje (inclusive hoje)
function getNextDateOfWeekFromDate(baseDate, targetDayOfWeek) { // targetDayOfWeek: 1 (Mon) to 7 (Sun)
  const currentDayOfWeek = getDay(baseDate) === 0 ? 7 : getDay(baseDate); // Make Sunday 7
  let dayDifference = targetDayOfWeek - currentDayOfWeek;
  if (dayDifference < 0) {
    dayDifference += 7;
  }
  return addDays(baseDate, dayDifference);
}

const initialFormState = {
  id: null, // Para edição
  client_id: "",
  day_of_week: 1,
  time: "",
  duration_period: "", // Será preenchido pelo pacote ou manualmente
  client_package_id: "",
  is_avulsa: true,
  professional_id: "",
  is_active: true,
  therapy_type: "Massagem", // Valor padrão
  notes: "", // Observações do horário fixo
};

export default function HorariosFixos() {
  const [fixedSchedules, setFixedSchedules] = useState([]);
  const [clients, setClients] = useState([]);
  const [professionalsList, setProfessionalsList] = useState([]);
  const [allSystemSessions, setAllSystemSessions] = useState([]);

  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [editingFixoId, setEditingFixoId] = useState(null);

  const [loading, setLoading] = useState({
    schedules: false, clients: false, professionals: false, sessions: false, action: false
  });
   const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  const fetchFixedSchedules = useCallback(async () => {
    setLoading(prev => ({ ...prev, schedules: true }));
    console.log("Buscando horários fixos..."); // DEBUG
    const { data, error } = await supabase.from('fixed_schedules').select('*').order('created_at', { ascending: false });
    
    console.log("Dados recebidos de fixed_schedules:", data); // DEBUG
    console.error("Erro ao buscar horários fixos (se houver):", error); // DEBUG

    if (error) {
      console.error("Erro detalhado ao buscar horários fixos:", error);
      setSnackbar({ open: true, message: `Erro ao buscar horários fixos: ${error.message}`, severity: "error" });
    } else {
      setFixedSchedules(data || []);
    }
    setLoading(prev => ({ ...prev, schedules: false }));
  }, []);

   const fetchClientsWithPackages = useCallback(async () => {
    setLoading(prev => ({ ...prev, clients: true }));
    const { data, error } = await supabase
      .from('clients')
      .select(`
        id,
        name,
        client_packages (
          id,
          package_id,
          package_name,
          total_sessions,
          sessions_used,
          validity_date,
          status,
          packages ( session_duration_text ) 
        )
      `)
      .order('name');
    if (error) {
      console.error("Erro ao buscar clientes:", error);
      setSnackbar({ open: true, message: `Erro ao buscar clientes: ${error.message}`, severity: "error" });
    } else {
      setClients(data || []);
    }
    setLoading(prev => ({ ...prev, clients: false }));
  }, []);

  const fetchProfessionals = useCallback(async () => {
    setLoading(prev => ({ ...prev, professionals: true }));
    const { data, error } = await supabase.from('professionals').select('id, name').order('name');
    if (error) {
      console.error("Erro ao buscar profissionais:", error);
      setSnackbar({ open: true, message: `Erro ao buscar profissionais: ${error.message}`, severity: "error" });
    } else {
      setProfessionalsList(data || []);
      // Definir profissional padrão no formulário se lista não estiver vazia e nenhum profissional selecionado
      if (data && data.length > 0 && !form.professional_id) {
        setForm(f => ({ ...f, professional_id: data[0].id }));
      }
    }
    setLoading(prev => ({ ...prev, professionals: false }));
  }, [form.professional_id]);

  const fetchAllSystemSessions = useCallback(async () => {
    setLoading(prev => ({ ...prev, sessions: true }));
    const { data, error } = await supabase.from('sessions').select('id, client_id, professional_id, session_date, session_time, status');
    if (error) {
      console.error("Erro ao buscar todas as sessões:", error);
    } else {
      setAllSystemSessions(data || []);
    }
    setLoading(prev => ({ ...prev, sessions: false }));
  }, []);

  useEffect(() => {
    fetchFixedSchedules();
    fetchClientsWithPackages();
    fetchProfessionals();
    fetchAllSystemSessions();
  }, [fetchFixedSchedules, fetchClientsWithPackages, fetchProfessionals, fetchAllSystemSessions]);

  const selectedClientData = useMemo(() => {
    return clients.find(c => c.id === form.client_id);
  }, [clients, form.client_id]);

  const activePackagesForSelectedClient = useMemo(() => {
    if (!selectedClientData || !Array.isArray(selectedClientData.client_packages)) return [];
    const today = new Date().toISOString().slice(0, 10);
    return selectedClientData.client_packages.filter(pkg => {
      const isExpiredByDate = pkg.validity_date && pkg.validity_date < today;
      const hasSessionsLeft = (pkg.sessions_used || 0) < (pkg.total_sessions || Infinity);
      return pkg.status === 'active' && !isExpiredByDate && hasSessionsLeft;
    });
  }, [selectedClientData]);

  useEffect(() => { // Auto-selecionar pacote e período
    if (!form.client_id) {
      setForm(f => ({ ...f, client_package_id: "", duration_period: "", is_avulsa: true }));
      return;
    }
    if (activePackagesForSelectedClient.length > 0) {
      const defaultPackage = activePackagesForSelectedClient.length === 1 ? activePackagesForSelectedClient[0] : null;
      const packageDuration = defaultPackage?.packages?.session_duration_text || defaultPackage?.session_duration_text || "";
      setForm(f => ({
        ...f,
        is_avulsa: !defaultPackage,
        client_package_id: defaultPackage ? defaultPackage.id : "",
        duration_period: packageDuration,
      }));
    } else {
      setForm(f => ({ ...f, client_package_id: "", duration_period: "", is_avulsa: true }));
    }
  }, [form.client_id, activePackagesForSelectedClient]);

  useEffect(() => { // Atualizar período se pacote mudar ou se tornar avulsa
    if (form.is_avulsa) {
        if (!editingFixoId) { // Só limpa se não estiver editando um avulso existente
             setForm(f => ({ ...f, client_package_id: "", duration_period: f.id && f.is_avulsa ? f.duration_period : "" }));
        }
    } else if (form.client_package_id) {
      const pkg = activePackagesForSelectedClient.find(p => p.id === form.client_package_id);
      const packageDuration = pkg?.packages?.session_duration_text || pkg?.session_duration_text || "";
      setForm(f => ({ ...f, duration_period: packageDuration }));
    } else {
       // Nenhum pacote selecionado, mas não é avulsa (pode acontecer se o único pacote for desmarcado)
       // Mantém o período se estiver editando, ou limpa se for novo
       if (!editingFixoId) setForm(f => ({ ...f, duration_period: "" }));
    }
  }, [form.client_package_id, form.is_avulsa, activePackagesForSelectedClient, editingFixoId]);


  const fixosParaConfirmar = useMemo(() => {
    const today = new Date();
    return fixedSchedules
      .filter(f => f.is_active)
      .map(f => {
        const dataAgendamento = format(getNextDateOfWeekFromDate(today, Number(f.day_of_week)), "yyyy-MM-dd");
        const jaMarcada = allSystemSessions.some(
          s =>
            s.client_id === f.client_id &&
            s.professional_id === f.professional_id &&
            s.session_date === dataAgendamento &&
            s.session_time === f.time &&
            s.status !== 'cancelled_by_client' && s.status !== 'cancelled_by_professional' && s.status !== 'cancelled'
        );
        return { ...f, dataAgendamento, jaMarcada };
      })
      .filter(f => !f.jaMarcada);
  }, [fixedSchedules, allSystemSessions]);


  const handleOpenDialog = (fixoToEdit = null) => {
    if (fixoToEdit) {
      setEditingFixoId(fixoToEdit.id);
      setForm({
        id: fixoToEdit.id,
        client_id: fixoToEdit.client_id,
        day_of_week: fixoToEdit.day_of_week,
        time: fixoToEdit.time,
        duration_period: fixoToEdit.duration_period,
        client_package_id: fixoToEdit.client_package_id || "",
        is_avulsa: fixoToEdit.is_avulsa,
        professional_id: fixoToEdit.professional_id,
        is_active: fixoToEdit.is_active,
        therapy_type: fixoToEdit.therapy_type || "Massagem",
        notes: fixoToEdit.notes || "",
      });
    } else {
      setEditingFixoId(null);
      setForm({...initialFormState, professional_id: professionalsList.length > 0 ? professionalsList[0].id : "" });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingFixoId(null);
    setForm(initialFormState);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSaveFixo = async () => {
    if (!form.client_id || !form.time || !form.duration_period || !form.professional_id) {
      setSnackbar({ open: true, message: "Preencha Cliente, Horário, Período e Profissional!", severity: "warning" });
      return;
    }
    setLoading(prev => ({ ...prev, action: true }));

    const dataToSave = {
      client_id: form.client_id,
      professional_id: form.professional_id,
      day_of_week: form.day_of_week,
      time: form.time,
      duration_period: form.duration_period,
      client_package_id: form.is_avulsa ? null : form.client_package_id || null,
      is_avulsa: form.is_avulsa,
      is_active: form.is_active,
      therapy_type: form.therapy_type,
      notes: form.notes,
    };

    let error;
    if (editingFixoId) { // Atualizar
      const { error: updateError } = await supabase.from('fixed_schedules').update(dataToSave).eq('id', editingFixoId);
      error = updateError;
    } else { // Criar
      const { error: insertError } = await supabase.from('fixed_schedules').insert(dataToSave);
      error = insertError;
    }

    if (error) {
      console.error("Erro ao salvar horário fixo:", error);
      setSnackbar({ open: true, message: `Erro ao salvar: ${error.message}`, severity: "error" });
    } else {
      setSnackbar({ open: true, message: `Horário fixo ${editingFixoId ? 'atualizado' : 'criado'}!`, severity: "success" });
      handleCloseDialog();
      await fetchFixedSchedules(); // Re-fetch
    }
    setLoading(prev => ({ ...prev, action: false }));
  };

  const handleDeleteFixo = async (id) => {
    if (!window.confirm("Excluir este horário fixo permanentemente?")) return;
    setLoading(prev => ({ ...prev, action: true }));
    const { error } = await supabase.from('fixed_schedules').delete().eq('id', id);
    if (error) {
      setSnackbar({ open: true, message: `Erro ao excluir: ${error.message}`, severity: "error" });
    } else {
      setSnackbar({ open: true, message: "Horário fixo excluído!", severity: "success" });
      await fetchFixedSchedules();
    }
    setLoading(prev => ({ ...prev, action: false }));
  };

  const handleToggleAtivo = async (fixo) => {
    setLoading(prev => ({ ...prev, action: true }));
    const { error } = await supabase
      .from('fixed_schedules')
      .update({ is_active: !fixo.is_active })
      .eq('id', fixo.id);
    if (error) {
      setSnackbar({ open: true, message: `Erro ao ${fixo.is_active ? 'desativar' : 'ativar'}: ${error.message}`, severity: "error" });
    } else {
      setSnackbar({ open: true, message: `Horário ${fixo.is_active ? 'desativado' : 'ativado'}!`, severity: "success" });
      await fetchFixedSchedules();
    }
    setLoading(prev => ({ ...prev, action: false }));
  };

  const handleConfirmarFixo = async (fixo) => {
    const client = clients.find(c => c.id === fixo.client_id);
    if (!client) {
      setSnackbar({ open: true, message: "Cliente não encontrado.", severity: "error" });
      return;
    }
    setLoading(prev => ({ ...prev, action: true }));

    const clientPackage = fixo.client_package_id
      ? client.client_packages?.find(p => p.id === fixo.client_package_id)
      : null;

    if (!fixo.is_avulsa && clientPackage && ((clientPackage.sessions_used || 0) >= (clientPackage.total_sessions || 0))) {
        setSnackbar({ open: true, message: "Pacote do cliente já atingiu o limite de sessões.", severity: "warning" });
        setLoading(prev => ({ ...prev, action: false }));
        return;
    }
    
    const today = new Date();
    const sessionDate = format(getNextDateOfWeekFromDate(today, Number(fixo.day_of_week)), "yyyy-MM-dd");

    const newSession = {
      client_id: fixo.client_id,
      client_name: client.name, // Denormalized
      professional_id: fixo.professional_id,
      session_date: sessionDate,
      session_time: fixo.time,
      duration_period: fixo.duration_period,
      therapy_type: fixo.therapy_type || "Massagem (Fixo)",
      status: "scheduled",
      client_package_id: fixo.is_avulsa ? null : fixo.client_package_id,
      package_name: fixo.is_avulsa || !clientPackage ? null : clientPackage.package_name, // Denormalized
      is_avulsa: fixo.is_avulsa,
      notes: fixo.notes ? `Origem: Horário Fixo (${fixo.notes})` : "Origem: Horário Fixo",
      // fixed_schedule_id: fixo.id, // Se você adicionou a coluna na tabela sessions
    };

    const { data: insertedSession, error: sessionError } = await supabase
      .from('sessions')
      .insert(newSession)
      .select()
      .single();

    if (sessionError) {
      console.error("Erro ao agendar sessão:", sessionError);
      setSnackbar({ open: true, message: `Erro ao agendar: ${sessionError.message}`, severity: "error" });
      setLoading(prev => ({ ...prev, action: false }));
      return;
    }

    // Atualizar sessions_used no pacote, se aplicável
    if (!fixo.is_avulsa && clientPackage && insertedSession) {
      const newSessionsUsed = (clientPackage.sessions_used || 0) + 1;
      const { error: packageError } = await supabase
        .from('client_packages')
        .update({ sessions_used: newSessionsUsed })
        .eq('id', clientPackage.id);

      if (packageError) {
        console.error("Erro ao atualizar pacote:", packageError);
        setSnackbar({ open: true, message: "Sessão agendada, mas falha ao atualizar pacote.", severity: "warning" });
        // Considerar reverter a sessão criada ou marcar para revisão manual
      }
    }
    setSnackbar({ open: true, message: "Sessão agendada com sucesso!", severity: "success" });
    await fetchAllSystemSessions(); // Para atualizar a lista de "jaMarcada"
    await fetchClientsWithPackages(); // Para atualizar contagem de sessões usadas nos pacotes
   setLoading(prev => ({ ...prev, action: false }));
  };


  // Adicione este console.log para verificar o estado antes da renderização
  console.log("Estado fixedSchedules ANTES DO RETURN:", fixedSchedules); // DEBUG
  console.log("Estado clients ANTES DO RETURN:", clients); // DEBUG
  console.log("Estado professionalsList ANTES DO RETURN:", professionalsList); // DEBUG


  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600, color: "primary.dark" }}>
        Gerenciar Horários Fixos
      </Typography>

      <Button
        variant="contained"
        startIcon={<AddIcon />}
        sx={{ mb: 2 }}
        onClick={() => handleOpenDialog()}
        disabled={loading.action || loading.clients || loading.professionals}
      >
        Novo Horário Fixo
      </Button>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Horários Fixos Cadastrados</Typography>
        {loading.schedules && <CircularProgress sx={{ display: 'block', margin: '20px auto' }} />}
        {!loading.schedules && (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Cliente</TableCell>
                <TableCell>Dia</TableCell>
                <TableCell>Horário</TableCell>
                <TableCell>Período</TableCell>
                <TableCell>Profissional</TableCell>
                <TableCell>Pacote</TableCell>
                <TableCell>Ativo</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fixedSchedules.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center">Nenhum horário fixo.</TableCell></TableRow>
              )}
              {fixedSchedules.map(fixo => {
                const clientName = clients.find(c => c.id === fixo.client_id)?.name || "Desconhecido";
                const profName = professionalsList.find(p => p.id === fixo.professional_id)?.name || "N/A";
                const clientForPackage = clients.find(c => c.id === fixo.client_id);
                const packageName = fixo.client_package_id && clientForPackage
                  ? clientForPackage.client_packages?.find(p => p.id === fixo.client_package_id)?.package_name
                  : (fixo.is_avulsa ? "Avulsa" : "N/A");

                return (
                  <TableRow key={fixo.id} hover>
                    <TableCell>{clientName}</TableCell>
                    <TableCell>{DIAS_SEMANA.find(d => d.value === Number(fixo.day_of_week))?.label}</TableCell>
                    <TableCell>{fixo.time}</TableCell>
                    <TableCell>{fixo.duration_period}</TableCell>
                    <TableCell>{profName}</TableCell>
                    <TableCell>{packageName}</TableCell>
                    <TableCell>
                      <Switch checked={fixo.is_active} onChange={() => handleToggleAtivo(fixo)} disabled={loading.action} />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Editar">
                        <IconButton color="primary" size="small" onClick={() => handleOpenDialog(fixo)} disabled={loading.action}>
                          <EditIcon fontSize="small"/>
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Excluir">
                        <IconButton color="error" size="small" onClick={() => handleDeleteFixo(fixo.id)} disabled={loading.action}>
                          <DeleteIcon fontSize="small"/>
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Agendar Próximas Sessões (Horários Fixos Ativos)</Typography>
        {(loading.schedules || loading.sessions) && <CircularProgress sx={{ display: 'block', margin: '20px auto' }} />}
        {!(loading.schedules || loading.sessions) && (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Cliente</TableCell>
                <TableCell>Data Agendamento</TableCell>
                <TableCell>Horário</TableCell>
                <TableCell>Profissional</TableCell>
                <TableCell>Pacote</TableCell>
                <TableCell>Ação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fixosParaConfirmar.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center">Nenhum horário fixo para agendar esta semana.</TableCell></TableRow>
              )}
              {fixosParaConfirmar.map(fixo => {
                 const clientName = clients.find(c => c.id === fixo.client_id)?.name || "Desconhecido";
                 const profName = professionalsList.find(p => p.id === fixo.professional_id)?.name || "N/A";
                 const clientForPackage = clients.find(c => c.id === fixo.client_id);
                 const packageName = fixo.client_package_id && clientForPackage
                   ? clientForPackage.client_packages?.find(p => p.id === fixo.client_package_id)?.package_name
                   : (fixo.is_avulsa ? "Avulsa" : "N/A");

                return (
                  <TableRow key={fixo.id + fixo.dataAgendamento} hover>
                    <TableCell>{clientName}</TableCell>
                    <TableCell>{format(new Date(fixo.dataAgendamento + "T00:00:00"), "dd/MM/yyyy")} ({DIAS_SEMANA.find(d => d.value === Number(fixo.day_of_week))?.label})</TableCell>
                    <TableCell>{fixo.time}</TableCell>
                    <TableCell>{profName}</TableCell>
                    <TableCell>{packageName}</TableCell>
                    <TableCell>
                      <Tooltip title="Agendar esta sessão">
                        <IconButton color="success" onClick={() => handleConfirmarFixo(fixo)} disabled={loading.action}>
                          <CheckCircleIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingFixoId ? "Editar" : "Criar"} Horário Fixo</DialogTitle>
        <DialogContent dividers>
          <FormControl fullWidth margin="dense" disabled={loading.clients}>
            <InputLabel>Cliente</InputLabel>
            <Select name="client_id" value={form.client_id} label="Cliente" onChange={handleFormChange}>
              {clients.map(c => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense" disabled={loading.professionals}>
            <InputLabel>Profissional</InputLabel>
            <Select name="professional_id" value={form.professional_id} label="Profissional" onChange={handleFormChange}>
              {professionalsList.map(p => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="dense">
            <InputLabel>Dia da semana</InputLabel>
            <Select name="day_of_week" value={form.day_of_week} label="Dia da semana" onChange={handleFormChange}>
              {DIAS_SEMANA.map(d => (<MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>))}
            </Select>
          </FormControl>
          <TextField fullWidth margin="dense" label="Horário" name="time" type="time" value={form.time} onChange={handleFormChange} inputProps={{ step: 300 }} InputLabelProps={{ shrink: true }}/>
          
          <FormControlLabel
              control={<Checkbox name="is_avulsa" checked={form.is_avulsa} onChange={handleFormChange} />}
              label="Sessão Avulsa (não vinculada a pacote)"
              sx={{mt:1, display:'block'}}
            />

          {!form.is_avulsa && selectedClientData && (
            <FormControl fullWidth margin="dense" disabled={activePackagesForSelectedClient.length === 0}>
              <InputLabel>Pacote do Cliente</InputLabel>
              <Select name="client_package_id" value={form.client_package_id} label="Pacote do Cliente" onChange={handleFormChange}>
                <MenuItem value=""><em>Nenhum (será avulsa se não selecionar)</em></MenuItem>
                {activePackagesForSelectedClient.map(pkg => (
                  <MenuItem key={pkg.id} value={pkg.id}>
                    {pkg.package_name} (Usadas: {pkg.sessions_used || 0}/{pkg.total_sessions || 'N/A'})
                  </MenuItem>
                ))}
              </Select>
              {activePackagesForSelectedClient.length === 0 && <Typography variant="caption" color="textSecondary">Nenhum pacote ativo para este cliente.</Typography>}
            </FormControl>
          )}
          <TextField fullWidth margin="dense" label="Período da Sessão" name="duration_period" value={form.duration_period} onChange={handleFormChange} placeholder="Ex: 1h, 1h30" disabled={!form.is_avulsa && !!form.client_package_id && !!activePackagesForSelectedClient.find(p=>p.id === form.client_package_id)?.packages?.session_duration_text} InputLabelProps={{ shrink: true }}/>
          <TextField fullWidth margin="dense" label="Tipo de Terapia (Padrão)" name="therapy_type" value={form.therapy_type} onChange={handleFormChange} placeholder="Ex: Massagem Relaxante" InputLabelProps={{ shrink: true }}/>
          <TextField fullWidth margin="dense" label="Observações do Horário Fixo" name="notes" value={form.notes} onChange={handleFormChange} multiline rows={2} placeholder="Notas internas sobre este horário fixo" InputLabelProps={{ shrink: true }}/>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={loading.action}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveFixo} disabled={loading.action}>
            {loading.action ? <CircularProgress size={24}/> : (editingFixoId ? "Salvar Alterações" : "Criar Horário")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}