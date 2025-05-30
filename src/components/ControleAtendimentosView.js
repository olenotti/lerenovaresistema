import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  FormControl, InputLabel, Select, MenuItem, IconButton, TextField, Button,
  CircularProgress, Alert, Tooltip, Snackbar as MuiSnackbar
} from "@mui/material";
import { format, addWeeks, addMonths, subMonths, startOfMonth, isSameMonth, isSameWeek, parseISO, isValid, compareAsc } from "date-fns";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import CancelIcon from '@mui/icons-material/Cancel';
import { supabase } from '../supabaseClient';

// Values are kept in frontend as per original code. Consider moving to DB.
const PACOTE_VALUES = {
  "Relax 5 sessões (30 min)": 400,
  "Relax 10 sessões (30 min)": 750,
  "Renove 5 sessões (1h)": 725,
  "Renove 10 sessões (1h)": 1250,
  "Revigore 5 sessões (1h30)": 925,
  "Revigore 10 sessões (1h30)": 1650,
  "Renovare 5 sessões (2h)": 1375,
  "Renovare 10 sessões (2h)": 2550,
};

const AVULSA_VALUES = {
  "30min": 85,
  "1h": 160,
  "1h30": 200,
  "2h": 290,
};

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function getPackageSessionDisplay(session, clientPackage, allPackageSessions) {
  if (!clientPackage || !session || !allPackageSessions) return "-";
  const totalSessionsInPackage = clientPackage.total_sessions || 0;
  const doneSessionsForThisPackage = allPackageSessions
    .filter(s => s.client_package_id === clientPackage.id && s.status === 'done')
    .sort((a, b) => {
      const aDate = isValid(parseISO(a.session_date)) ? parseISO(a.session_date) : new Date(0);
      const bDate = isValid(parseISO(b.session_date)) ? parseISO(b.session_date) : new Date(0);
      if (aDate.getTime() !== bDate.getTime()) return compareAsc(aDate, bDate);
      return (a.session_time || "").localeCompare(b.session_time || "");
    });
  const sessionIndex = doneSessionsForThisPackage.findIndex(s => s.id === session.id);
  if (sessionIndex === -1) {
    return `${clientPackage.sessions_used || '?'}/${totalSessionsInPackage || 'N/A'}`;
  }
  return `${sessionIndex + 1}/${totalSessionsInPackage || 'N/A'}`;
}

export default function ControleAtendimentosView() {
  const [allSessions, setAllSessions] = useState([]);
  const [clients, setClients] = useState([]);
  const [manualEntries, setManualEntries] = useState([]);
  
  const [loading, setLoading] = useState({ clients: true, sessions: true, manualEntries: true, savePrice: false });
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  const [tab, setTab] = useState("mes");
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [currentWeek, setCurrentWeek] = useState(getMonday(new Date()));
  
  const [manualValue, setManualValue] = useState("");
  const [manualDesc, setManualDesc] = useState("");

  const [displayFinancialEntries, setDisplayFinancialEntries] = useState([]);
  const [editingPriceEntryId, setEditingPriceEntryId] = useState(null);
  const [currentEditingPrice, setCurrentEditingPrice] = useState("");

  const fetchAllData = useCallback(async () => {
    setLoading({ clients: true, sessions: true, manualEntries: true, savePrice: false });
    setError(null);
    try {
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select(`
          id, name,
          client_packages (
            id, package_id, package_name, total_sessions, sessions_used,
            validity_date, status, assigned_at, is_new_financial_entry,
            price_override 
          )
        `);
      if (clientsError) throw clientsError;
      setClients(clientsData || []);
      setLoading(prev => ({ ...prev, clients: false }));

      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*, price_override'); 
      if (sessionsError) throw sessionsError;
      setAllSessions(sessionsData || []);
      setLoading(prev => ({ ...prev, sessions: false }));

      const { data: manualData, error: manualError } = await supabase
        .from('manual_financial_entries')
        .select('*')
        .order('entry_date', { ascending: false });
      if (manualError) throw manualError;
      setManualEntries(manualData || []);
      setLoading(prev => ({ ...prev, manualEntries: false }));

    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err.message || "Failed to load data.");
      setSnackbar({ open: true, message: `Erro ao carregar dados: ${err.message}`, severity: "error" });
      setLoading({ clients: false, sessions: false, manualEntries: false, savePrice: false });
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const getNewPackagesInPeriod = useCallback((clientsData, periodCheck) => {
    const pkgs = [];
    clientsData.forEach(client => {
      (client.client_packages || []).forEach(pkg => {
        if (pkg.is_new_financial_entry && pkg.assigned_at && periodCheck(pkg.assigned_at)) {
          const defaultValue = PACOTE_VALUES[pkg.package_name] || 0;
          pkgs.push({
            unique_id: `new_package-${pkg.id}`,
            db_id: pkg.id,
            clientName: client.name,
            name: pkg.package_name,
            value: typeof pkg.price_override === 'number' ? pkg.price_override : defaultValue,
            original_value: defaultValue,
            date: pkg.assigned_at,
            type: 'new_package',
            is_editable: true
          });
        }
      });
    });
    return pkgs;
  }, []);

 const getAvulsasInPeriod = useCallback((sessionsData, periodCheck, clientsData) => {
    return sessionsData
      .filter(s => s.status === "done" && s.is_avulsa && s.session_date && periodCheck(s.session_date))
      .map(s => {
        const defaultValue = AVULSA_VALUES[s.duration_period] || 0;
        return {
          unique_id: `avulsa_session-${s.id}`,
          db_id: s.id,
          clientName: clientsData.find(c => c.id === s.client_id)?.name || "Cliente Desconhecido",
          period: s.duration_period,
          massageType: s.therapy_type,
          date: s.session_date,
          time: s.session_time, // Adicionar o horário da sessão
          value: typeof s.price_override === 'number' ? s.price_override : defaultValue,
          original_value: defaultValue,
          type: 'avulsa_session',
          is_editable: true
        };
      });
  }, []);

  const getManualInPeriod = useCallback((manualEntriesData, periodCheck) => {
    return manualEntriesData
      .filter(e => e.entry_date && periodCheck(e.entry_date))
      .map(e => ({
        unique_id: `manual_entry-${e.id}`,
        db_id: e.id,
        desc: e.description,
        value: Number(e.value) || 0,
        date: e.entry_date,
        type: 'manual_entry',
        is_editable: false
      }));
  }, []);
  
  useEffect(() => {
    const checkMonth = dateStr => dateStr && isValid(parseISO(dateStr)) && isSameMonth(parseISO(dateStr), currentMonth);
    const checkWeek = dateStr => dateStr && isValid(parseISO(dateStr)) && isSameWeek(parseISO(dateStr), currentWeek, { weekStartsOn: 1 });
    const currentPeriodCheck = tab === "mes" ? checkMonth : checkWeek;
    const newPkgs = getNewPackagesInPeriod(clients, currentPeriodCheck);
    const avulsas = getAvulsasInPeriod(allSessions, currentPeriodCheck, clients);
    const manuals = getManualInPeriod(manualEntries, currentPeriodCheck);
    setDisplayFinancialEntries([...newPkgs, ...avulsas, ...manuals].sort((a,b) => compareAsc(parseISO(a.date), parseISO(b.date))));
  }, [clients, allSessions, manualEntries, currentMonth, currentWeek, tab, getNewPackagesInPeriod, getAvulsasInPeriod, getManualInPeriod]);

  const sessionsRealizadasNoPeriodo = allSessions.filter(
    s => s.status === "done" && s.session_date && (tab === "mes" ? 
        (dateStr => dateStr && isValid(parseISO(dateStr)) && isSameMonth(parseISO(dateStr), currentMonth))(s.session_date) : 
        (dateStr => dateStr && isValid(parseISO(dateStr)) && isSameWeek(parseISO(dateStr), currentWeek, { weekStartsOn: 1 }))(s.session_date)
    )
  ).sort((a,b) => {
      const aDate = parseISO(a.session_date);
      const bDate = parseISO(b.session_date);
      if (aDate.getTime() !== bDate.getTime()) return bDate.getTime() - aDate.getTime();
      return (b.session_time || "").localeCompare(a.session_time || "");
  });

  const totalEntrada = displayFinancialEntries.reduce((sum, entry) => sum + Number(entry.value), 0);

  const handleAddManualEntry = async () => {
    if (!manualValue || isNaN(parseFloat(manualValue))) {
        setSnackbar({ open: true, message: "Valor da entrada manual é inválido.", severity: "error" });
        return;
    }
    setError(null);
    const newEntry = {
      entry_date: format(new Date(), "yyyy-MM-dd"),
      description: manualDesc,
      value: parseFloat(manualValue),
    };
    const { data, error: insertError } = await supabase
      .from('manual_financial_entries')
      .insert(newEntry)
      .select()
      .single();
    if (insertError) {
      console.error("Error adding manual entry:", insertError);
      setError(insertError.message);
      setSnackbar({ open: true, message: `Erro ao adicionar: ${insertError.message}`, severity: "error" });
    } else if (data) {
      setSnackbar({ open: true, message: "Entrada manual adicionada!", severity: "success" });
      setManualValue("");
      setManualDesc("");
      await fetchAllData(); // Refresh
    }
  };

  const handleRemoveFinancialEntry = async (uniqueId, entryType, dbId) => {
    if (!window.confirm("Tem certeza que deseja remover esta entrada financeira? Esta ação pode não ser reversível para todos os tipos.")) return;
    setError(null);
    setSnackbar({ open: false, message: "", severity: "info" });
    try {
      if (entryType === 'manual_entry') {
        const { error: deleteError } = await supabase
          .from('manual_financial_entries')
          .delete()
          .eq('id', dbId);
        if (deleteError) throw deleteError;
      } else if (entryType === 'new_package') { 
        const { error: updateError } = await supabase
          .from('client_packages')
          .update({ is_new_financial_entry: false, price_override: null })
          .eq('id', dbId);
        if (updateError) throw updateError;
      } else if (entryType === 'avulsa_session') { 
        // To "remove" from financial entries without affecting "atendimentos realizados":
        // 1. Keep session status as is (e.g., 'done').
        // 2. Set its financial contribution to zero by setting price_override to 0.
        // The session will still be listed in the financial entries table if it's 'done' 
        // and 'is_avulsa', but its displayed value will be R$ 0.00.
        const { error: updateError } = await supabase
          .from('sessions')
          .update({ price_override: 0 }) // Set financial value to 0, do not change status
          .eq('id', dbId);
        if (updateError) throw updateError;
      }
      setSnackbar({ open: true, message: "Entrada financeira processada/removida.", severity: "success" });
      await fetchAllData();
    } catch (err) {
      console.error("Error processing financial entry removal:", err);
      setError(err.message);
      setSnackbar({ open: true, message: `Erro ao processar remoção: ${err.message}`, severity: "error" });
    }
  };

  const handleEditPrice = (entry) => {
    setEditingPriceEntryId(entry.unique_id);
    setCurrentEditingPrice(String(entry.value));
  };

  const handleCancelEditPrice = () => {
    setEditingPriceEntryId(null);
    setCurrentEditingPrice("");
  };

  const handleSavePriceChange = async (entryToSave) => {
    if (currentEditingPrice === "" || isNaN(parseFloat(currentEditingPrice))) {
      setSnackbar({ open: true, message: "Valor inválido.", severity: "error" });
      return;
    }
    const newPrice = parseFloat(currentEditingPrice);
    setLoading(prev => ({ ...prev, savePrice: true }));
    setSnackbar({ open: false, message: "", severity: "info" });
    try {
      let tableName, priceColumnName = 'price_override', idColumnName = 'id';
      if (entryToSave.type === 'new_package') tableName = 'client_packages';
      else if (entryToSave.type === 'avulsa_session') tableName = 'sessions';
      else throw new Error("Tipo de entrada inválido para edição de preço.");

      const { error: updateError } = await supabase
        .from(tableName)
        .update({ [priceColumnName]: newPrice })
        .eq(idColumnName, entryToSave.db_id);
      if (updateError) throw updateError;

      setSnackbar({ open: true, message: "Preço atualizado com sucesso!", severity: "success" });
      setEditingPriceEntryId(null);
      await fetchAllData();
    } catch (err) {
      console.error("Error saving price change:", err);
      setError(err.message);
      setSnackbar({ open: true, message: `Erro ao salvar preço: ${err.message}`, severity: "error" });
    } finally {
      setLoading(prev => ({ ...prev, savePrice: false }));
    }
  };
  
  const handleRemoveRealizada = async (sessionIdToRemove) => {
    if (!window.confirm("Remover este atendimento realizado? Isso pode afetar a contagem de sessões do pacote.")) return;
    setError(null);
    try {
        const sessionToRemove = allSessions.find(s => s.id === sessionIdToRemove);
        if (!sessionToRemove) {
            setSnackbar({ open: true, message: "Sessão não encontrada.", severity: "error" });
            return;
        }
        const { error: deleteSessionError } = await supabase
            .from('sessions')
            .delete()
            .eq('id', sessionIdToRemove);
        if (deleteSessionError) throw deleteSessionError;

        if (sessionToRemove.client_package_id && sessionToRemove.status === 'done') {
            const clientPackage = clients.flatMap(c => c.client_packages || []).find(p => p.id === sessionToRemove.client_package_id);
            if (clientPackage && (clientPackage.sessions_used || 0) > 0) {
                const newSessionsUsed = clientPackage.sessions_used - 1;
                const { error: updatePackageError } = await supabase
                    .from('client_packages')
                    .update({ sessions_used: newSessionsUsed })
                    .eq('id', clientPackage.id);
                if (updatePackageError) {
                    console.warn("Sessão removida, mas falha ao atualizar contagem do pacote:", updatePackageError.message);
                }
            }
        }
        setSnackbar({ open: true, message: "Atendimento removido.", severity: "success" });
        await fetchAllData();
    } catch (err) {
        console.error("Error removing 'realizada' session:", err);
        setError(err.message);
        setSnackbar({ open: true, message: `Erro ao remover atendimento: ${err.message}`, severity: "error" });
    }
  };

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handlePrevWeek = () => setCurrentWeek(prev => addWeeks(prev, -1));
  const handleNextWeek = () => setCurrentWeek(prev => addWeeks(prev, 1));

  const getClientName = (clientId) => clients.find(c => c.id === clientId)?.name || "Cliente Desconhecido";

  if (loading.clients || loading.sessions || loading.manualEntries) {
    return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <MuiSnackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </MuiSnackbar>
      {error && !loading.savePrice && <Alert severity="error" sx={{ mb: 2 }}>{`Erro geral: ${error}`}</Alert>}
      
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 600, color: "#224488" }}>
        Controle Financeiro e Atendimentos
      </Typography>
      <Paper sx={{ p: 2, mb: 3 }}>
        <FormControl sx={{ minWidth: 160, mr: 2, mb: {xs: 1, sm: 0} }}>
          <InputLabel>Visualizar por</InputLabel>
          <Select value={tab} label="Visualizar por" onChange={e => setTab(e.target.value)}>
            <MenuItem value="mes">Mês</MenuItem>
            <MenuItem value="semana">Semana</MenuItem>
          </Select>
        </FormControl>
        {tab === "mes" ? (
          <Box sx={{ display: "inline-flex", alignItems: "center" }}>
            <IconButton onClick={handlePrevMonth}><ArrowBackIcon /></IconButton>
            <Typography sx={{ mx: 2, fontWeight: 500 }}>
              {format(currentMonth, "MMMM yyyy").charAt(0).toUpperCase() +
                format(currentMonth, "MMMM yyyy").slice(1)}
            </Typography>
            <IconButton onClick={handleNextMonth}><ArrowForwardIcon /></IconButton>
          </Box>
        ) : (
          <Box sx={{ display: "inline-flex", alignItems: "center" }}>
            <IconButton onClick={handlePrevWeek}><ArrowBackIcon /></IconButton>
            <Typography sx={{ mx: 2, fontWeight: 500 }}>
              Semana de {format(currentWeek, "dd/MM/yyyy")}
            </Typography>
            <IconButton onClick={handleNextWeek}><ArrowForwardIcon /></IconButton>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Entradas financeiras do período</Typography>
        <Box sx={{ mb: 2, display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 1.5 }}>
          <TextField
            label="Valor (R$)" size="small" type="number" value={manualValue}
            onChange={e => setManualValue(e.target.value)} sx={{ width: 120 }}
            InputProps={{ inputProps: { step: "0.01" } }}
          />
          <TextField
            label="Descrição da Entrada Manual" size="small" value={manualDesc}
            onChange={e => setManualDesc(e.target.value)} sx={{ flexGrow: 1, minWidth: 200 }}
          />
          <Button variant="contained" color="primary" onClick={handleAddManualEntry} sx={{height: '40px'}}>
            Adicionar Manual
          </Button>
        </Box>
        <Typography variant="body1" sx={{ fontWeight: 600, color: "#00796b", fontSize: '1.2rem' }}>
          Total de Entradas no Período: <span style={{ fontSize: '1.5rem' }}>R$ {totalEntrada.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </Typography>
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Tipo</TableCell>
              <TableCell>Data</TableCell>
              <TableCell>Hora</TableCell> {/* Nova coluna */}
              <TableCell>Cliente/Descrição</TableCell>
              <TableCell align="right" sx={{minWidth: 180}}>Valor (R$)</TableCell>
              <TableCell align="center">Ação</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayFinancialEntries.map(e => (
              <TableRow key={e.unique_id}>
                <TableCell>
                    {e.type === 'new_package' && 'Pacote Novo'}
                    {e.type === 'avulsa_session' && 'Sessão Avulsa'}
                    {e.type === 'manual_entry' && 'Entrada Manual'}
                </TableCell>
                <TableCell>{format(parseISO(e.date), "dd/MM/yyyy")}</TableCell>
                <TableCell>{e.type === 'avulsa_session' ? e.time || "-" : "-"}</TableCell> {/* Conteúdo da nova coluna */}
                <TableCell>
                    {e.type === 'new_package' && `${e.clientName} — ${e.name}`}
                    {/* Remover a exibição do horário daqui, pois agora tem coluna própria */}
                    {e.type === 'avulsa_session' && 
                      `${e.clientName} (${e.period || 'N/A'})${e.massageType ? ' - ' + e.massageType : ''}`
                    }
                    {e.type === 'manual_entry' && (e.desc || "-")}
                </TableCell>
                <TableCell align="right">
                  {e.is_editable ? (
                    editingPriceEntryId === e.unique_id ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <TextField
                          type="number"
                          value={currentEditingPrice}
                          onChange={(event) => setCurrentEditingPrice(event.target.value)}
                          size="small"
                          sx={{ width: '80px', mr: 0.5 }}
                          inputProps={{ step: "0.01" }}
                          onKeyDown={(ev) => { if (ev.key === 'Enter') { handleSavePriceChange(e); ev.preventDefault();}}}
                          disabled={loading.savePrice}
                        />
                        <Tooltip title="Salvar Preço">
                          <span> {/* Span for Tooltip when IconButton is disabled */}
                            <IconButton onClick={() => handleSavePriceChange(e)} size="small" color="primary" disabled={loading.savePrice}>
                              {loading.savePrice && editingPriceEntryId === e.unique_id ? <CircularProgress size={16} /> : <SaveIcon fontSize="small"/>}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Cancelar Edição">
                          <IconButton onClick={handleCancelEditPrice} size="small" disabled={loading.savePrice}>
                            <CancelIcon fontSize="small"/>
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {Number(e.value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <Tooltip title="Editar Preço">
                          <IconButton onClick={() => handleEditPrice(e)} size="small" sx={{ ml: 0.5 }}>
                            <EditIcon fontSize="small"/>
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )
                  ) : (
                    Number(e.value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  )}
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="Remover esta entrada financeira">
                    <IconButton size="small" color="error" onClick={() => handleRemoveFinancialEntry(e.unique_id, e.type, e.db_id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
           {displayFinancialEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">Nenhuma entrada financeira registrada no período selecionado.</TableCell> {/* Ajustar colSpan */}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="h6">
            {tab === "mes" ? "Atendimentos realizados no mês" : "Atendimentos realizados na semana"}
          </Typography>
          <Typography variant="h6" sx={{ color: "green", fontWeight: 700 }}>
            Total: {sessionsRealizadasNoPeriodo.length}
          </Typography>
        </Box>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Data</TableCell>
              <TableCell>Hora</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>Tipo de Terapia</TableCell>
              <TableCell>Período</TableCell>
              <TableCell>Pacote (Sessão)</TableCell>
              <TableCell>Observações</TableCell>
              <TableCell align="center">Ação</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sessionsRealizadasNoPeriodo.map(sess => {
                const clientForSession = clients.find(c => c.id === sess.client_id);
                const packageForSession = clientForSession?.client_packages.find(p => p.id === sess.client_package_id);
                return (
                    <TableRow key={sess.id}>
                    <TableCell>{format(parseISO(sess.session_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{sess.session_time || "-"}</TableCell>
                    <TableCell>{getClientName(sess.client_id)}</TableCell>
                    <TableCell>{sess.therapy_type || "-"}</TableCell>
                    <TableCell>{sess.duration_period || "-"}</TableCell>
                    <TableCell>
                        {sess.client_package_id && packageForSession
                        ? `${packageForSession.package_name} (${getPackageSessionDisplay(sess, packageForSession, allSessions)})`
                        : (sess.is_avulsa ? "Avulsa" : "-")}
                    </TableCell>
                    <TableCell>{sess.notes || "-"}</TableCell>
                    <TableCell align="center">
                        <Tooltip title="Remover este atendimento realizado">
                            <IconButton size="small" color="error" onClick={() => handleRemoveRealizada(sess.id)} >
                                <DeleteIcon fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                    </TableCell>
                    </TableRow>
                );
            })}
            {sessionsRealizadasNoPeriodo.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">Nenhum atendimento realizado no período selecionado.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}