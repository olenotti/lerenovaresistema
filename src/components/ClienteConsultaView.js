// filepath: /Users/caio/Desktop/lerenovare/lerenovare/meu-app-react/src/components/ClienteConsultaView.js
import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Paper, MenuItem, FormControl, InputLabel, Select,
  Table, TableHead, TableRow, TableCell, TableBody, TextField, IconButton,
  Chip, Stack, Divider, CircularProgress, Alert, Tooltip
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import PhoneIcon from "@mui/icons-material/Phone";
import NotesIcon from "@mui/icons-material/Notes";
import AssignmentIcon from "@mui/icons-material/Assignment"; // Encerrado por uso
import LocalOfferIcon from "@mui/icons-material/LocalOffer"; // Pacote
import EventNoteIcon from "@mui/icons-material/EventNote"; // Data
import CheckCircleIcon from "@mui/icons-material/CheckCircle"; // Ativo / Realizada
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty"; // Agendada
import CancelIcon from "@mui/icons-material/Cancel"; // Vencido / Cancelada
import EventBusyIcon from '@mui/icons-material/EventBusy'; // Vencido por data
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'; // Encerrado por uso
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'; // Status desconhecido
import { supabase } from '../supabaseClient';

// Utility to format date as DD/MM/YYYY
const formatDateForDisplay = (dateStr) => {
  if (!dateStr) return "-";
  try {
    const dateObj = new Date(dateStr + "T00:00:00"); // Ensure correct parsing if only date
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return dateStr; // Fallback
  }
};

// Utility to format time (HH:MM:SS to HH:MM)
const formatTimeForDisplay = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return "-";
  return timeStr.substring(0, 5);
};


export default function ClienteConsultaView() {
  const [clients, setClients] = useState([]);
  const [sessionsForSelectedClient, setSessionsForSelectedClient] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [searchClientName, setSearchClientName] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState(null);

  const fetchClientsWithPackages = useCallback(async () => {
    setLoadingClients(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('clients')
        .select(`
          id,
          name,
          phone,
          notes,
          email,
          birthday,
          client_packages (
            id,
            package_id,
            package_name,
            total_sessions,
            sessions_used,
            validity_date,
            status,
            start_date
          )
        `)
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;
      setClients(data || []);
    } catch (e) {
      console.error("Erro ao buscar clientes:", e);
      setError("Falha ao carregar clientes. " + e.message);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const fetchSessionsForClient = useCallback(async (clientId) => {
    if (!clientId) {
      setSessionsForSelectedClient([]);
      return;
    }
    setLoadingSessions(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('sessions')
        .select('*')
        .eq('client_id', clientId)
        .order('session_date', { ascending: false })
        .order('session_time', { ascending: false });

      if (fetchError) throw fetchError;
      setSessionsForSelectedClient(data || []);
    } catch (e) {
      console.error("Erro ao buscar sessões do cliente:", e);
      setError("Falha ao carregar sessões do cliente. " + e.message);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchClientsWithPackages();
  }, [fetchClientsWithPackages]);

  useEffect(() => {
    if (selectedClientId) {
      fetchSessionsForClient(selectedClientId);
    } else {
      setSessionsForSelectedClient([]);
    }
  }, [selectedClientId, fetchSessionsForClient]);

  const filteredClientsByName = clients.filter(c =>
    c.name?.toLowerCase().includes(searchClientName.toLowerCase())
  );

  const selectedClient = clients.find(c => c.id === selectedClientId);

  const handleCancelSession = async (sessionToCancel) => {
    if (!sessionToCancel || !window.confirm("Tem certeza que deseja cancelar esta sessão? Esta ação não pode ser desfeita e pode estornar o uso do pacote se aplicável.")) {
      return;
    }
    setLoadingSessions(true); // Indicate activity
    setError(null);
    try {
      // 1. Update session status to 'cancelled_by_professional' (or a generic 'cancelled')
      const { error: updateSessionError } = await supabase
        .from('sessions')
        .update({ status: 'cancelled_by_professional' }) // Or a more generic 'cancelled'
        .eq('id', sessionToCancel.id);

      if (updateSessionError) throw updateSessionError;

      // 2. If session was part of a package and was 'scheduled' or 'confirmed', decrement sessions_used
      if (sessionToCancel.client_package_id && 
          (sessionToCancel.status === 'scheduled' || sessionToCancel.status === 'confirmed')) {
        
        const clientPackage = selectedClient?.client_packages.find(p => p.id === sessionToCancel.client_package_id);
        if (clientPackage && (clientPackage.sessions_used || 0) > 0) {
          const newSessionsUsed = clientPackage.sessions_used - 1;
          const { error: updatePackageError } = await supabase
            .from('client_packages')
            .update({ sessions_used: newSessionsUsed })
            .eq('id', clientPackage.id);

          if (updatePackageError) {
            console.warn("Sessão cancelada, mas falha ao estornar uso do pacote:", updatePackageError.message);
            // Continue to refresh data, but maybe show a specific warning
          }
        }
      }
      // Refresh data for the selected client
      await fetchSessionsForClient(selectedClientId);
      await fetchClientsWithPackages(); // To update package session counts if changed
    } catch (e) {
      console.error("Erro ao cancelar sessão:", e);
      setError("Falha ao cancelar sessão. " + e.message);
    } finally {
      setLoadingSessions(false);
    }
  };
  
  const getPackageSessionNumberDisplay = (session, clientPackage) => {
    if (!clientPackage || !session.client_package_id || session.client_package_id !== clientPackage.id) {
      return "-";
    }

    const sessionsInPackageSorted = sessionsForSelectedClient
      .filter(s => s.client_package_id === clientPackage.id && (s.status === 'scheduled' || s.status === 'done' || s.status === 'confirmed'))
      .sort((a, b) => {
        const dateA = new Date(`${a.session_date}T${a.session_time || '00:00:00'}`);
        const dateB = new Date(`${b.session_date}T${b.session_time || '00:00:00'}`);
        if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
        return String(a.id).localeCompare(String(b.id));
      });

    const chronologicalIndex = sessionsInPackageSorted.findIndex(s => s.id === session.id);

    if (chronologicalIndex === -1 && (session.status === 'scheduled' || session.status === 'done' || session.status === 'confirmed')) {
       // This session should be in the list if it's scheduled/done/confirmed and belongs to the package
       // If it's not, it might be a data consistency issue or the session is not yet in sessionsForSelectedClient
       console.warn("Session not found in sorted package list for display number", {session, clientPackage, sessionsInPackageSorted});
       return `?/${clientPackage.total_sessions || 'N/A'}`;
    }
    if (chronologicalIndex === -1) { // If not found (e.g. cancelled session still trying to display this)
        return '-';
    }

    // Use the logic from Agendamentos.js getPackageSessionText
    // (clientPackage.sessions_used || 0) is the total count of used sessions for this package.
    // sessionsInPackageSorted.length is the number of scheduled/done/confirmed sessions for this package currently visible.
    // chronologicalIndex is the 0-based position of the current session within that visible list.
    const numeroDaSessaoAtual = (clientPackage.sessions_used || 0) - sessionsInPackageSorted.length + (chronologicalIndex + 1);
    const finalNumeroDaSessao = Math.max(1, numeroDaSessaoAtual);

    return `${finalNumeroDaSessao}/${clientPackage.total_sessions || 'N/A'}`;
  };

  const getClientPackageStatusInfo = (clientPackage) => {
    if (!clientPackage) return { text: 'N/A', color: 'default', icon: <HelpOutlineIcon /> };
    
    const today = new Date();
    today.setHours(0,0,0,0); // Compare date part only

    const validityDate = clientPackage.validity_date ? new Date(clientPackage.validity_date + "T00:00:00") : null;
    if (validityDate) validityDate.setHours(0,0,0,0);


    if (clientPackage.status === 'cancelled' || clientPackage.status === 'expired_manual') {
        return { text: 'Encerrado', color: 'error', icon: <CancelIcon sx={{ fontSize: 16 }} /> };
    }
    if (validityDate && validityDate < today) {
      return { text: 'Vencido', color: 'error', icon: <EventBusyIcon sx={{ fontSize: 16 }} /> };
    }
    // Ensure total_sessions is a number before comparing
    const totalSessions = typeof clientPackage.total_sessions === 'number' ? clientPackage.total_sessions : Infinity;
    if ((clientPackage.sessions_used || 0) >= totalSessions && totalSessions > 0) { // Check totalSessions > 0 to avoid issues with 0/0 packages
      return { text: 'Completo', color: 'warning', icon: <AssignmentTurnedInIcon sx={{ fontSize: 16 }} /> };
    }
    if (clientPackage.status === 'active') {
      return { text: 'Ativo', color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> };
    }
    // Fallback for other statuses or if status is null/undefined
    return { text: clientPackage.status || 'Checar', color: 'default', icon: <HelpOutlineIcon sx={{ fontSize: 16 }} /> };
  };

  function renderSessionsForPackageColumn(client, clientPackage) {
    const sessionsList = sessionsForSelectedClient
      .filter(s => s.client_package_id === clientPackage.id && (s.status === "scheduled" || s.status === "done"))
      .sort((a, b) => {
        const dateA = new Date(`${a.session_date}T${a.session_time || '00:00:00'}`);
        const dateB = new Date(`${b.session_date}T${b.session_time || '00:00:00'}`);
        if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
        return String(a.id).localeCompare(String(b.id));
      });

    if (sessionsList.length === 0) return <Typography variant="caption" sx={{pl:2, color: 'text.secondary'}}>Nenhuma sessão agendada/realizada neste pacote.</Typography>;

    return (
      <Stack spacing={0.5} sx={{ mt: 0.5, mb: 0.5, pl: 2, pr:1 }}>
        {sessionsList.map(sess => (
          <Box key={sess.id} sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: '0.8rem' }}>
            <Chip
              size="small"
              color={sess.status === "done" ? "success" : "warning"}
              icon={sess.status === "done" ? <CheckCircleIcon sx={{fontSize: 14}} /> : <HourglassEmptyIcon sx={{fontSize: 14}} />}
              label={`${getPackageSessionNumberDisplay(sess, clientPackage)}`}
              sx={{ minWidth: 90, fontWeight: 500, fontSize: '0.75rem' }}
            />
            <Typography variant="caption">
              {formatDateForDisplay(sess.session_date)} {formatTimeForDisplay(sess.session_time)}{" "}
              <span style={{ color: sess.status === "done" ? "green" : "orange", fontWeight: 500 }}>
                ({sess.status === "done" ? "Realizada" : "Agendada"})
              </span>
               - {sess.therapy_type}
            </Typography>
          </Box>
        ))}
      </Stack>
    );
  }


  return (
    <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 900, mx: "auto" }}>
      <Paper sx={{ p: { xs: 1.5, md: 2.5 }, mb: 2, borderRadius: 2}}>
        <Typography variant="h5" sx={{ fontWeight: 600, color: "primary.main", mb: 2 }}>
          Consulta de Cliente
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }} alignItems="center">
          <TextField
            label="Buscar cliente por nome"
            variant="outlined"
            size="small"
            fullWidth
            value={searchClientName}
            onChange={e => setSearchClientName(e.target.value)}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Selecione o Cliente</InputLabel>
            <Select
              value={selectedClientId}
              label="Selecione o Cliente"
              onChange={e => setSelectedClientId(e.target.value)}
              disabled={loadingClients}
              MenuProps={{ PaperProps: { style: { maxHeight: 300 } } }}
            >
              {loadingClients && <MenuItem value=""><CircularProgress size={20} /></MenuItem>}
              {!loadingClients && filteredClientsByName.length === 0 && <MenuItem value="" disabled>Nenhum cliente encontrado</MenuItem>}
              {filteredClientsByName.map(c => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {loadingClients && !selectedClient && <CircularProgress sx={{display: 'block', margin: '20px auto'}} />}
        {error && <Alert severity="error" sx={{my: 2}}>{error}</Alert>}

        {selectedClient && (
          <>
            <Box sx={{ mb: 2.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: "secondary.main" }}>
                {selectedClient.name}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <PhoneIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="body2">
                    {selectedClient.phone || <i>não informado</i>}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <NotesIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="body2" sx={{ fontStyle: selectedClient.notes ? 'normal' : 'italic' }}>
                    {selectedClient.notes || "sem observações"}
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, background: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.50' }}>
              <Typography sx={{ fontWeight: 500, color: "text.primary", mb: 1, fontSize: '1.1rem' }}>
                Pacotes do Cliente
              </Typography>
              {(selectedClient.client_packages && selectedClient.client_packages.length > 0) ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{py:0.5}}><LocalOfferIcon sx={{ fontSize: 18, color: "text.secondary", verticalAlign: 'middle' }} /></TableCell>
                      <TableCell sx={{py:0.5}}>Pacote</TableCell>
                      <TableCell sx={{py:0.5}}>Validade</TableCell>
                      <TableCell sx={{py:0.5}}>Sessões (Usadas/Total)</TableCell>
                      <TableCell sx={{py:0.5}}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedClient.client_packages.sort((a,b) => new Date(b.start_date || 0) - new Date(a.start_date || 0)).map(pkg => {
                      const statusInfo = getClientPackageStatusInfo(pkg);
                      return (
                        <React.Fragment key={pkg.id}>
                          <TableRow hover sx={{ '& > *': { borderColor: 'rgba(224, 224, 224, 0.5)'} }}>
                            <TableCell sx={{ fontWeight: 500, py:0.5 }}>{pkg.id}</TableCell>
                            <TableCell sx={{py:0.5}}>{pkg.package_name}</TableCell>
                            <TableCell sx={{py:0.5}}>{formatDateForDisplay(pkg.validity_date)}</TableCell>
                            <TableCell sx={{py:0.5}}>
                              <Chip
                                label={`${pkg.sessions_used || 0} / ${pkg.total_sessions || 'N/A'}`}
                                size="small"
                                sx={{ fontWeight: 500 }}
                              />
                            </TableCell>
                            <TableCell sx={{py:0.5}}>
                              <Chip label={statusInfo.text} color={statusInfo.color} size="small" icon={statusInfo.icon} sx={{fontSize: '0.75rem'}} />
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ '& > td': { padding:0, borderBottom: '1px solid rgba(224, 224, 224, 1)' } }}>
                            <TableCell colSpan={5} sx={{ backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'grey.700' : '#fafafa' }}>
                              {renderSessionsForPackageColumn(selectedClient, pkg)}
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <Typography sx={{ mt: 1, color: "text.secondary" }}><i>Nenhum pacote associado a este cliente.</i></Typography>
              )}
            </Paper>
          </>
        )}
      </Paper>

      {selectedClient && (
        <Paper sx={{ p: { xs: 1.5, md: 2.5 }, borderRadius: 2, mt: 2 }}>
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: "primary.main" }}>
            Histórico Geral de Sessões do Cliente
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          {loadingSessions && <CircularProgress sx={{display: 'block', margin: '20px auto'}} />}
          {!loadingSessions && sessionsForSelectedClient.length === 0 && (
            <Typography sx={{ textAlign: 'center', color: "text.secondary", my:2 }}>Nenhuma sessão encontrada para este cliente.</Typography>
          )}
          {!loadingSessions && sessionsForSelectedClient.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><EventNoteIcon sx={{ fontSize: 18, color: "text.secondary", verticalAlign: 'middle' }} /></TableCell>
                  <TableCell>Hora</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Período</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Pacote (Sessão)</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessionsForSelectedClient.map(sess => {
                   const clientPackageForSession = selectedClient.client_packages.find(p => p.id === sess.client_package_id);
                   let statusColor = "default";
                   let statusIcon = <HourglassEmptyIcon sx={{ fontSize: 16 }} />;
                   let statusLabel = sess.status;

                   if (sess.status === "scheduled") { statusColor = "primary"; statusLabel="Agendada"; }
                   else if (sess.status === "done") { statusColor = "success"; statusIcon = <CheckCircleIcon sx={{ fontSize: 16 }} />; statusLabel="Realizada"; }
                   else if (sess.status === "confirmed") { statusColor = "info"; statusIcon = <CheckCircleIcon sx={{ fontSize: 16 }} />; statusLabel="Confirmada"; }
                   else if (sess.status && sess.status.startsWith("cancelled")) { statusColor = "error"; statusIcon = <CancelIcon sx={{ fontSize: 16 }} />; statusLabel="Cancelada"; }
                  
                  return (
                    <TableRow key={sess.id} hover>
                      <TableCell>{formatDateForDisplay(sess.session_date)}</TableCell>
                      <TableCell>{formatTimeForDisplay(sess.session_time)}</TableCell>
                      <TableCell>{sess.therapy_type}</TableCell>
                      <TableCell>{sess.duration_period}</TableCell>
                      <TableCell>
                        <Chip label={statusLabel} color={statusColor} size="small" icon={statusIcon} sx={{fontSize: '0.75rem'}} />
                      </TableCell>
                      <TableCell>
                        {sess.client_package_id && clientPackageForSession
                          ? `${clientPackageForSession.package_name || 'Pacote'} (${getPackageSessionNumberDisplay(sess, clientPackageForSession)})`
                          : (sess.is_avulsa ? <i>Avulsa</i> : <i>-</i>)
                        }
                      </TableCell>
                      <TableCell>
                        {(sess.status === "scheduled" || sess.status === "confirmed") && (
                          <Tooltip title="Cancelar Sessão">
                            <IconButton
                              aria-label="Cancelar sessão"
                              color="error"
                              onClick={() => handleCancelSession(sess)}
                              size="small"
                            >
                              <DeleteIcon fontSize="small"/>
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Paper>
      )}
    </Box>
  );
}