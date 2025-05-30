import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, TextField, Checkbox, FormControlLabel,
  CircularProgress, Alert
} from "@mui/material";
import { supabase } from '../supabaseClient'; // Adjust path if needed

const formatDate = (dateString) => {
  if (!dateString) return "-";
  const datePart = dateString.includes('T') ? dateString.split('T')[0] : dateString;
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return dateString; 
  return `${day}/${month}/${year}`;
};

const isClientPackageConsideredEnded = (clientPackage) => {
  if (!clientPackage) return true;

  if (clientPackage.status === 'expired' || clientPackage.status === 'completed') {
    return true;
  }

  if (clientPackage.validity_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validityDate = new Date(clientPackage.validity_date);
    validityDate.setHours(0, 0, 0, 0); 
    if (validityDate < today) {
      return true; 
    }
  }
  
  const sessoesRealizadas = typeof clientPackage.sessions_used === 'number' ? clientPackage.sessions_used : 0;
  const totalSessoesDoPacote = typeof clientPackage.total_sessions === 'number' ? clientPackage.total_sessions : 
                              (clientPackage.packages && typeof clientPackage.packages.total_sessions === 'number' ? clientPackage.packages.total_sessions : null);

  if (totalSessoesDoPacote !== null && sessoesRealizadas >= totalSessoesDoPacote) {
    return true; 
  }
  
  return false;
};


export default function PackageManager() {
  const [clients, setClients] = useState([]);
  const [packageDefinitions, setPackageDefinitions] = useState([]);
  const [clientPackages, setClientPackages] = useState([]);
  const [allSessions, setAllSessions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentClientPackage, setCurrentClientPackage] = useState(null);
  const [selectedClientIdForEdit, setSelectedClientIdForEdit] = useState('');
  const [selectedPackageDefId, setSelectedPackageDefId] = useState('');
  const [sessionsUsedForEdit, setSessionsUsedForEdit] = useState(0);
  const [validityForEdit, setValidityForEdit] = useState('');
  const [isNewFinancialEntry, setIsNewFinancialEntry] = useState(false);

  const fetchClients = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('id, name').order('name');
    if (error) throw error;
    setClients(data || []);
  }, []);

  const fetchPackageDefinitions = useCallback(async () => {
    const { data, error } = await supabase.from('packages').select('id, name, total_sessions').order('name');
    if (error) throw error;
    setPackageDefinitions(data || []);
  }, []);

  const fetchClientPackages = useCallback(async () => {
    const { data, error } = await supabase
      .from('client_packages')
      .select(`
        id,
        client_id,
        clients (name),
        package_id,
        packages (name, total_sessions), 
        package_name,
        start_date,
        validity_date,
        sessions_used,
        total_sessions,
        status,
        is_new_financial_entry,
        assigned_at
      `)
      .order('created_at', { ascending: false });
    if (error) throw error;
    setClientPackages(data || []);
  }, []);

  const fetchAllSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('session_date');
    if (error) throw error;
    setAllSessions(data || []);
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchClients(),
        fetchPackageDefinitions(),
        fetchClientPackages(),
        fetchAllSessions()
      ]);
    } catch (err) {
      console.error("Error loading initial data:", err);
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [fetchClients, fetchPackageDefinitions, fetchClientPackages, fetchAllSessions]);

  useEffect(() => {
    if (supabase) {
      loadInitialData();
    }
  }, [loadInitialData]);

  const activeClientPackages = clientPackages.filter(cp => 
    cp.status === 'active' && !isClientPackageConsideredEnded(cp)
  );
  const endedClientPackages = clientPackages.filter(cp => 
    cp.status !== 'active' || isClientPackageConsideredEnded(cp)
  );

  const handleOpenEditDialog = (cp = null) => {
    setError(null);
    if (cp) {
      setCurrentClientPackage(cp);
      setSelectedClientIdForEdit(cp.client_id);
      setSelectedPackageDefId(cp.package_id);
      setSessionsUsedForEdit(cp.sessions_used || 0);
      setValidityForEdit(cp.validity_date || '');
      setIsNewFinancialEntry(cp.is_new_financial_entry || false);
    } else {
      setCurrentClientPackage(null);
      setSelectedClientIdForEdit('');
      setSelectedPackageDefId('');
      setSessionsUsedForEdit(0);
      
      const today = new Date();
      const futureDate = new Date(today.setMonth(today.getMonth() + 10));
      const year = futureDate.getFullYear();
      const month = (futureDate.getMonth() + 1).toString().padStart(2, '0');
      const day = futureDate.getDate().toString().padStart(2, '0');
      setValidityForEdit(`${year}-${month}-${day}`);
      
      setIsNewFinancialEntry(false);
    }
    setEditDialogOpen(true);
  };

  const handleSaveClientPackage = async () => {
    if (!selectedClientIdForEdit || !selectedPackageDefId) {
      setError("Cliente e Pacote são obrigatórios.");
      return;
    }
    setError(null);

    const selectedPkgDef = packageDefinitions.find(pd => pd.id === selectedPackageDefId);
    if (!selectedPkgDef) {
      setError("Definição de pacote não encontrada.");
      return;
    }
    
    const totalSessionsFromDef = typeof selectedPkgDef.total_sessions === 'number' ? selectedPkgDef.total_sessions : 0;

    if (parseInt(sessionsUsedForEdit, 10) > totalSessionsFromDef) {
        setError("Sessões usadas não podem exceder o total de sessões do pacote.");
        return;
    }

    const dataToSave = {
      client_id: selectedClientIdForEdit,
      package_id: selectedPackageDefId,
      package_name: selectedPkgDef.name,
      total_sessions: totalSessionsFromDef,
      sessions_used: parseInt(sessionsUsedForEdit, 10) || 0,
      validity_date: validityForEdit || null,
      is_new_financial_entry: isNewFinancialEntry,
      status: 'active', 
    };

    if (!currentClientPackage) { // Novo pacote
      dataToSave.assigned_at = new Date().toISOString();
      dataToSave.start_date = new Date().toISOString().split('T')[0];
    }

    try {
      if (currentClientPackage && currentClientPackage.id) {
        const { error: updateError } = await supabase
          .from('client_packages')
          .update(dataToSave)
          .eq('id', currentClientPackage.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('client_packages')
          .insert(dataToSave);
        if (insertError) throw insertError;
      }
      setEditDialogOpen(false);
      loadInitialData();
    } catch (err) {
      console.error("Error saving client package:", err);
      setError(err.message || "Failed to save package.");
    }
  };

  const handleRemoveClientPackage = async (clientPackageId) => {
    if (!window.confirm("Tem certeza que deseja remover este pacote do cliente? As sessões associadas podem precisar ser desvinculadas ou removidas manualmente se necessário.")) return;
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('client_packages')
        .delete()
        .eq('id', clientPackageId);
      if (deleteError) throw deleteError;
      loadInitialData();
    } catch (err) {
      console.error("Error removing client package:", err);
      setError(err.message || "Failed to remove package.");
    }
  };

 const renderSessionsInfo = (cp) => {
    const sessoesRealizadas = typeof cp.sessions_used === 'number' ? cp.sessions_used : 0;
    const totalSessoes = typeof cp.total_sessions === 'number' ? cp.total_sessions : 
                      (cp.packages && typeof cp.packages.total_sessions === 'number' ? cp.packages.total_sessions : 'N/A');
    
    const sessionsForThisPackage = allSessions.filter(s => s.client_package_id === cp.id)
      .sort((a,b) => new Date(a.session_date) - new Date(b.session_date));

    const statusTranslations = {
      done: "Realizada",
      scheduled: "Agendada",
      confirmed: "Confirmada",
      canceled: "Cancelada",
    };

    const getTranslatedStatus = (status) => {
      return statusTranslations[status] || status;
    };

    return (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {sessoesRealizadas} / {totalSessoes}
        </Typography>
        {sessionsForThisPackage.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.8rem' }}>
            {sessionsForThisPackage.slice(0, 3).map((sess, index) => (
              <li key={sess.id}>
                Sessão {index + 1}: {formatDate(sess.session_date)} ({getTranslatedStatus(sess.status)})
              </li>
            ))}
            {sessionsForThisPackage.length > 3 && <li>... e mais</li>}
          </ul>
        )}
      </Box>
    );
  };

  if (loading) return <CircularProgress />;
  if (error && !editDialogOpen) return <Alert severity="error" sx={{m:2}}>{error}</Alert>;

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Gerenciar Pacotes de Clientes</Typography>
        <Button variant="contained" onClick={() => handleOpenEditDialog()}>
          Adicionar Pacote a Cliente
        </Button>
      </Box>
      {error && editDialogOpen && <Alert severity="error" sx={{mb:2}}>{error}</Alert>}

      <Typography variant="h6" sx={{ mb: 1, mt: 2 }}>Pacotes Ativos</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Cliente</TableCell>
            <TableCell>Pacote</TableCell>
            <TableCell>Sessões (Usadas/Total)</TableCell>
            <TableCell>Validade</TableCell>
            <TableCell>Ações</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {activeClientPackages.length === 0 && (
            <TableRow><TableCell colSpan={5} align="center">Nenhum pacote ativo.</TableCell></TableRow>
          )}
          {activeClientPackages.map((cp) => (
            <TableRow key={cp.id}>
              <TableCell>{cp.clients?.name || 'Cliente não encontrado'}</TableCell>
              <TableCell>{cp.package_name || (cp.packages?.name || 'Pacote não encontrado')}</TableCell>
              <TableCell>{renderSessionsInfo(cp)}</TableCell>
              <TableCell>{formatDate(cp.validity_date)}</TableCell>
              <TableCell>
                <Button size="small" onClick={() => handleOpenEditDialog(cp)} sx={{ mr: 1 }}>Editar</Button>
                <Button size="small" color="error" onClick={() => handleRemoveClientPackage(cp.id)}>Remover</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Typography variant="h6" sx={{ mb: 1, mt: 4 }}>Pacotes Encerrados</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Cliente</TableCell>
            <TableCell>Pacote</TableCell>
            <TableCell>Sessões</TableCell>
            <TableCell>Validade</TableCell>
            <TableCell>Status Final</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {endedClientPackages.length === 0 && (
            <TableRow><TableCell colSpan={5} align="center">Nenhum pacote encerrado.</TableCell></TableRow>
          )}
          {endedClientPackages.map((cp) => (
            <TableRow key={cp.id}>
              <TableCell>{cp.clients?.name || 'Cliente não encontrado'}</TableCell>
              <TableCell>{cp.package_name || (cp.packages?.name || 'Pacote não encontrado')}</TableCell>
              <TableCell>{renderSessionsInfo(cp)}</TableCell>
              <TableCell>{formatDate(cp.validity_date)}</TableCell>
              <TableCell>
                {cp.status === 'expired' ? 'Expirado' : 
                 cp.status === 'completed' ? 'Concluído' : 
                 (isClientPackageConsideredEnded(cp) ? 'Finalizado (Sessões/Validade)' : cp.status || 'N/A')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{currentClientPackage ? "Editar Pacote do Cliente" : "Adicionar Pacote ao Cliente"}</DialogTitle>
        <DialogContent sx={{pt: '20px !important', display: 'flex', flexDirection: 'column', gap: 2}}>
          <FormControl fullWidth required>
            <InputLabel id="client-select-label">Cliente</InputLabel>
            <Select
              labelId="client-select-label"
              value={selectedClientIdForEdit}
              label="Cliente"
              onChange={(e) => setSelectedClientIdForEdit(e.target.value)}
              disabled={!!currentClientPackage}
            >
              {clients.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl fullWidth required>
            <InputLabel id="package-def-select-label">Tipo de Pacote</InputLabel>
            <Select
              labelId="package-def-select-label"
              value={selectedPackageDefId}
              label="Tipo de Pacote"
              onChange={(e) => {
                const newPackageId = e.target.value;
                setSelectedPackageDefId(newPackageId);
                const pkgDef = packageDefinitions.find(pd => pd.id === newPackageId);
                if (pkgDef) {
                  const maxSessions = typeof pkgDef.total_sessions === 'number' ? pkgDef.total_sessions : 0;
                  if (sessionsUsedForEdit > maxSessions) {
                    setSessionsUsedForEdit(0); 
                  }
                } else {
                  setSessionsUsedForEdit(0); 
                }
              }}
            >
              {packageDefinitions.map(pd => <MenuItem key={pd.id} value={pd.id}>{pd.name} ({pd.total_sessions || 0} sessões)</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="sessions-used-select-label">Sessões Usadas</InputLabel>
            <Select
              labelId="sessions-used-select-label"
              value={sessionsUsedForEdit}
              label="Sessões Usadas"
              onChange={(e) => setSessionsUsedForEdit(parseInt(e.target.value, 10))}
              disabled={!selectedPackageDefId}
            >
              {(() => {
                const pkgDef = packageDefinitions.find(pd => pd.id === selectedPackageDefId);
                const maxSessions = pkgDef && typeof pkgDef.total_sessions === 'number' ? pkgDef.total_sessions : 0;
                const options = [];
                for (let i = 0; i <= maxSessions; i++) {
                  options.push(<MenuItem key={i} value={i}>{i}</MenuItem>);
                }
                if (options.length === 0 && selectedPackageDefId) { 
                    options.push(<MenuItem key={0} value={0}>0</MenuItem>);
                } else if (options.length === 0 && !selectedPackageDefId) {
                     options.push(<MenuItem key={0} value={0} disabled>Selecione um pacote</MenuItem>);
                }
                return options;
              })()}
            </Select>
          </FormControl>
          
          <TextField
            label="Validade do Pacote"
            type="date"
            fullWidth
            value={validityForEdit}
            onChange={(e) => setValidityForEdit(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={isNewFinancialEntry}
                onChange={(e) => setIsNewFinancialEntry(e.target.checked)}
              />
            }
            label="Pacote Novo (Registrar como Entrada Financeira)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEditDialogOpen(false); setError(null); }}>Cancelar</Button>
          <Button onClick={handleSaveClientPackage} variant="contained">Salvar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}