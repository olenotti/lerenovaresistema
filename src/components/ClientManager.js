import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box, Typography, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, CircularProgress, Alert,
  Paper,
  List, ListItem, ListItemText, IconButton,
  Snackbar
} from "@mui/material";
import { supabase } from '../supabaseClient';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CakeIcon from '@mui/icons-material/Cake';

// Função para obter a data atual no formato YYYY-MM-DD
const getCurrentDate = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Função para obter a data atual no formato DD-MM para aniversários
const getCurrentDayMonth = () => {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${dd}-${mm}`;
};

const formatDateForDisplay = (dateString) => {
  if (!dateString) return "-";
  // Adiciona T00:00:00 para garantir que a data seja interpretada em UTC e evitar problemas de fuso ao converter.
  const dateObj = new Date(dateString + "T00:00:00");
  const day = String(dateObj.getUTCDate()).padStart(2, "0");
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0"); // Meses são 0-indexados
  const year = dateObj.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

const formatBirthdayForDisplay = (birthday) => {
  if (!birthday || birthday.length !== 5 || birthday[2] !== '-') return "-";
  return birthday.replace('-', '/');
};

function emptyClient() {
  return {
    id: null,
    name: "",
    email: "",
    phone: "",
    birthday: "", // Formato DD-MM
    notes: "",
  };
}

const isPackageExpired = (pkg) => {
  if (!pkg || !pkg.validity_date) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Adiciona T00:00:00 para garantir que a data seja interpretada em UTC
  return new Date(pkg.validity_date + "T00:00:00") < today;
};

export default function ClientManager({ clientsProp = [], fetchClientsProp, loadingClientsProp }) { // Valor padrão para clientsProp
  const [packages, setPackages] = useState([]);
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(emptyClient());
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [error, setError] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const [activePackageDetails, setActivePackageDetails] = useState({
    package_id: '',
    validity_date: '',
  });

  const fetchPackages = useCallback(async () => {
    try {
      const { data, error: pkgError } = await supabase
        .from('packages')
        .select('*')
        .order('name');
      if (pkgError) throw pkgError;
      setPackages(data || []);
    } catch (err) {
      console.error('Erro ao buscar pacotes:', err.message);
      // Não definir setError aqui para não sobrescrever erros mais críticos do ClientManager
      // Apenas logar ou usar um snackbar específico para pacotes se necessário.
    }
  }, []);

  useEffect(() => {
    if (supabase) {
      fetchPackages();
    }
  }, [fetchPackages]);

  const aniversariantesDoDiaLocal = useMemo(() => {
    if (!Array.isArray(clientsProp) || clientsProp.length === 0) return []; // Verificação
    const hojeDDMM = getCurrentDayMonth();
    return clientsProp.filter(c => c && c.birthday === hojeDDMM); // Verifica se 'c' existe
  }, [clientsProp]);

  const handleOpenWhatsAppAniversariante = (phone) => {
    if (!phone) {
      setSnackbarMessage("Telefone do cliente não encontrado.");
      setSnackbarOpen(true);
      return;
    }
    let num = phone.replace(/\D/g, "");
    if (num.length === 10 || num.length === 11) {
        num = "55" + num;
    } else if (num.length === 12 || num.length === 13) {
        if (!num.startsWith("55")) {
            num = "55" + num.substring(num.length - (num.length === 12 ? 10 : 11));
        }
    } else {
        setSnackbarMessage("Formato de telefone inválido para WhatsApp.");
        setSnackbarOpen(true);
        return;
    }
    window.open(`https://wa.me/${num}`, "_blank");
  };

  const handleCopyMensagemAniversario = (nomeCliente) => {
    const primeiroNome = nomeCliente ? nomeCliente.split(" ")[0] : "Cliente"; // Fallback
    const mensagem = `🎉 Feliz Aniversário, ${primeiroNome}! 🎂

Toda a equipe Le Renovare deseja a você um dia incrível, cheio de alegria, paz e momentos especiais! ✨

Para celebrar com você, estamos presenteando com um cupom de 8% DE DESCONTO em todas as nossas sessões avulsas e SPAs, *válido pelos próximos 10 dias!* 💆‍♂️🌿

Gostaria de aproveitar seu presente e agendar uma sessão para relaxar e se cuidar?

Felicidades! 🥳
Equipe Le Renovare`;

    navigator.clipboard.writeText(mensagem).then(() => {
      setSnackbarMessage(`Mensagem de aniversário para ${primeiroNome} copiada!`);
      setSnackbarOpen(true);
    }).catch(err => {
      console.error('Erro ao copiar mensagem:', err);
      setSnackbarMessage("Falha ao copiar mensagem.");
      setSnackbarOpen(true);
    });
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  const getActiveClientPackage = (clientData) => {
    // Verifica se clientData e clientData.client_packages são arrays válidos
    if (!clientData || !Array.isArray(clientData.client_packages) || clientData.client_packages.length === 0) return null;
    return clientData.client_packages.find(pkg => pkg && !isPackageExpired(pkg) && pkg.status === 'active') || null;
  };

  const getPackageDisplay = (clientData) => {
    const activePkg = getActiveClientPackage(clientData);
    return activePkg ? activePkg.package_name : "-";
  };

  const getValidityDisplay = (clientData) => {
    const activePkg = getActiveClientPackage(clientData);
    return activePkg && activePkg.validity_date ? formatDateForDisplay(activePkg.validity_date) : "-";
  };

  const handleOpen = (c = null) => {
    setError(null);
    if (c) {
      // Garante que 'c' e 'c.client_packages' existam antes de tentar acessá-los
      const clientDataWithPackages = {
        ...emptyClient(),
        ...c,
        client_packages: Array.isArray(c.client_packages) ? c.client_packages : [],
      };
      setClient(clientDataWithPackages);
      const activePkg = getActiveClientPackage(clientDataWithPackages);
      if (activePkg) {
        setActivePackageDetails({
          package_id: activePkg.package_id,
          validity_date: activePkg.validity_date || '',
        });
      } else {
        setActivePackageDetails({ package_id: '', validity_date: '' });
      }
    } else {
      setClient(emptyClient());
      setActivePackageDetails({ package_id: '', validity_date: '' });
    }
    setOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setClient(prev => ({ ...prev, [name]: value }));
  };

  const handlePackageChange = (e) => {
    const selectedPackageId = e.target.value;
    setActivePackageDetails(prev => ({
      ...prev,
      package_id: selectedPackageId,
    }));
  };

   const handleValidityChange = (e) => {
    setActivePackageDetails(prev => ({ ...prev, validity_date: e.target.value }));
  };

  const handleSave = async () => {
    if (!supabase) {
      setError("Cliente Supabase não inicializado.");
      return;
    }
    setError(null);

    if (!client.name) {
        setError("O nome do cliente é obrigatório.");
        return;
    }

    if (client.email) {
      let query = supabase
        .from('clients')
        .select('id', { count: 'exact' }) // Apenas o ID é necessário para verificar a existência
        .eq('email', client.email);
      if (client.id) {
        query = query.not('id', 'eq', client.id);
      }
      const { data: existingEmail, error: emailError } = await query.maybeSingle();
      if (emailError && emailError.code !== 'PGRST116') { // PGRST116: 0 rows
        setError('Erro ao verificar e-mail. Tente novamente.');
        console.error('Erro ao verificar e-mail:', emailError);
        return;
      }
      if (existingEmail) {
        setError('Este e-mail já está em uso por outro cliente.');
        return;
      }
    }

    const clientDataToSave = {
      name: client.name,
      email: client.email || null,
      phone: client.phone || null,
      birthday: client.birthday || null,
      notes: client.notes || null,
    };

    try {
      let savedClient;
      if (client.id) {
        const { data, error: updateError } = await supabase
          .from('clients')
          .update(clientDataToSave)
          .eq('id', client.id)
          .select()
          .single();
        if (updateError) throw updateError;
        savedClient = data;
      } else {
        const { data, error: insertError } = await supabase
          .from('clients')
          .insert([clientDataToSave])
          .select()
          .single();
        if (insertError) throw insertError;
        savedClient = data;
      }

      if (savedClient && activePackageDetails.package_id) {
        const selectedPackageInfo = packages.find(p => p.id === activePackageDetails.package_id);
        const clientPackageData = {
          client_id: savedClient.id,
          package_id: activePackageDetails.package_id,
          package_name: selectedPackageInfo?.name,
          validity_date: activePackageDetails.validity_date || null,
          start_date: getCurrentDate(),
          total_sessions: selectedPackageInfo?.total_sessions,
          status: 'active',
          sessions_used: 0,
        };

        // Busca o cliente atualizado de clientsProp para pegar os pacotes mais recentes
        const currentClientState = Array.isArray(clientsProp) ? clientsProp.find(c => c.id === savedClient.id) : null;
        const clientPackagesFromState = currentClientState && Array.isArray(currentClientState.client_packages) ? currentClientState.client_packages : [];

        const existingActivePackageForThisType = clientPackagesFromState.find(
          (p) => p.package_id === clientPackageData.package_id && p.status === 'active'
        );

        if (existingActivePackageForThisType) {
          if (existingActivePackageForThisType.validity_date !== clientPackageData.validity_date) {
            const { error: updatePkgError } = await supabase
              .from('client_packages')
              .update({ validity_date: clientPackageData.validity_date })
              .eq('id', existingActivePackageForThisType.id);
            if (updatePkgError) throw updatePkgError;
          }
        } else {
          const currentActivePackagesOfClient = clientPackagesFromState.filter(p => p.status === 'active');
          for (const pkg of currentActivePackagesOfClient) {
            await supabase.from('client_packages').update({ status: 'inactive' }).eq('id', pkg.id);
          }
          const { error: insertPkgError } = await supabase
            .from('client_packages')
            .insert([clientPackageData]);
          if (insertPkgError) throw insertPkgError;
        }
      } else if (savedClient && !activePackageDetails.package_id) { // Se nenhum pacote foi selecionado no formulário
        const currentClientState = Array.isArray(clientsProp) ? clientsProp.find(c => c.id === savedClient.id) : null;
        const activeClientPackagesFromState = currentClientState && Array.isArray(currentClientState.client_packages)
            ? currentClientState.client_packages.filter(p => p.status === 'active')
            : [];

        for (const pkg of activeClientPackagesFromState) {
          await supabase.from('client_packages').update({ status: 'inactive' }).eq('id', pkg.id);
        }
      }

      if (typeof fetchClientsProp === 'function') {
        await fetchClientsProp();
      }
      setOpen(false);
      setClient(emptyClient());
      setActivePackageDetails({ package_id: '', validity_date: '' });
      setSnackbarMessage(`Cliente ${client.id ? 'atualizado' : 'criado'} com sucesso!`);
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Erro ao salvar cliente:', err.message);
      setError(`Erro ao salvar cliente: ${err.message}`);
    }
  };

  const handleDeleteClick = (c) => {
    setClientToDelete(c);
    setDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (clientToDelete && supabase) {
      try {
        const { error: pkgError } = await supabase
          .from('client_packages')
          .delete()
          .eq('client_id', clientToDelete.id);
        // Não lançar erro aqui se não houver pacotes, pode ser normal
        if (pkgError && pkgError.code !== 'PGRST116') throw pkgError;


        const { error: sessionError } = await supabase
          .from('sessions')
          .delete()
          .eq('client_id', clientToDelete.id);
        if (sessionError && sessionError.code !== 'PGRST116') throw sessionError;
        
        const { error: clientError } = await supabase
          .from('clients')
          .delete()
          .eq('id', clientToDelete.id);
        if (clientError) throw clientError;

        if (typeof fetchClientsProp === 'function') {
          await fetchClientsProp();
        }
        setDeleteDialog(false);
        setClientToDelete(null);
        setSnackbarMessage("Cliente e dados associados removidos com sucesso.");
        setSnackbarOpen(true);
      } catch (err) {
        console.error('Erro ao remover cliente:', err.message);
        setError(`Erro ao remover cliente: ${err.message}`);
        setSnackbarMessage(`Erro ao remover cliente: ${err.message}`); // Mostrar erro no snackbar
        setSnackbarOpen(true);
        // Não fechar o diálogo de delete automaticamente em caso de erro, para o usuário ver a mensagem.
      }
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialog(false);
    setClientToDelete(null);
    setError(null); // Limpar erro ao cancelar
  };

  // Prioriza o loadingClientsProp se ele existir e for true
  const displayLoading = typeof loadingClientsProp === 'boolean' ? loadingClientsProp : false;

  if (displayLoading && !open && !deleteDialog) {
    return <CircularProgress sx={{display: 'block', margin: 'auto', mt: 4}}/>;
  }

  // Mostra erro principal se não estiver em um dialog
  if (error && !open && !deleteDialog) {
    return <Alert severity="error" sx={{m:2}}>{error}</Alert>;
  }

  return (
    <Box sx={{ width: '100%', p: 0 }}> {/* Alterado para width: '100%' e p: 0 */}
      {aniversariantesDoDiaLocal.length > 0 && (
        <Paper elevation={3} sx={{ mb: 3, p: 2, backgroundColor: 'warning.light' }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <CakeIcon sx={{ mr: 1 }} /> Aniversariantes do Dia!
          </Typography>
          <List dense>
            {aniversariantesDoDiaLocal.map(aniversariante => (
              <ListItem
                key={aniversariante.id}
                secondaryAction={
                  <>
                    <IconButton
                      edge="end"
                      aria-label="whatsapp"
                      onClick={() => handleOpenWhatsAppAniversariante(aniversariante.phone)}
                      color="success"
                    >
                      <WhatsAppIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="copy-message"
                      onClick={() => handleCopyMensagemAniversario(aniversariante.name)}
                      color="primary"
                      sx={{ ml: 1 }}
                    >
                      <ContentCopyIcon />
                    </IconButton>
                  </>
                }
              >
                <ListItemText primary={aniversariante.name} secondary={`Telefone: ${aniversariante.phone || '-'}`} />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      <Typography variant="h5" sx={{ mb: 2 }}>Gerenciar Clientes</Typography>
      <Button variant="contained" sx={{ mb: 2 }} onClick={() => handleOpen()}>Novo Cliente</Button>
      
      {/* Erro dentro do Dialog de Adição/Edição ou Remoção */}
      {error && (open || deleteDialog) && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Paper elevation={2}>
        <TableContainer> {/* Envolve a tabela para rolagem se necessário */}
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Telefone</TableCell>
                <TableCell>Aniversário (DD/MM)</TableCell>
                <TableCell>Pacote Ativo</TableCell>
                <TableCell>Validade</TableCell>
                <TableCell>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.isArray(clientsProp) && clientsProp.map(c => ( // Verifica se clientsProp é array
                c && // Verifica se 'c' (cliente) existe antes de renderizar a TableRow
                <TableRow key={c.id} hover>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.email || "-"}</TableCell>
                  <TableCell>{c.phone || "-"}</TableCell>
                  <TableCell>{formatBirthdayForDisplay(c.birthday)}</TableCell>
                  <TableCell>{getPackageDisplay(c)}</TableCell>
                  <TableCell>{getValidityDisplay(c)}</TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => handleOpen(c)}>Editar</Button>
                    <Button size="small" color="error" onClick={() => handleDeleteClick(c)} sx={{ ml: 1 }}>
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!Array.isArray(clientsProp) || clientsProp.length === 0) && !displayLoading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">Nenhum cliente encontrado.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={open} onClose={() => { setOpen(false); setError(null); }} fullWidth maxWidth="sm">
        <DialogTitle>{client.id ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: '20px !important' }}>
          {/* Alert de erro específico para o dialog */}
          {error && <Alert severity="error" sx={{width: '100%', mb:1}}>{error}</Alert>}
          <TextField label="Nome" name="name" value={client.name} onChange={handleChange} autoFocus fullWidth required />
          <TextField label="Email" name="email" type="email" value={client.email || ""} onChange={handleChange} fullWidth />
          <TextField label="Telefone" name="phone" value={client.phone || ""} onChange={handleChange} fullWidth />
          <TextField
            label="Aniversário (DD-MM)"
            name="birthday"
            value={client.birthday || ""}
            onChange={handleChange}
            placeholder="ex: 24-08"
            inputProps={{ maxLength: 5 }}
            fullWidth
            helperText="Use o formato DD-MM, ex: 24-08 para 24 de Agosto."
          />
          <TextField label="Observações" name="notes" value={client.notes || ""} onChange={handleChange} multiline rows={3} fullWidth />
          <FormControl fullWidth>
            <InputLabel id="package-select-label">Pacote Ativo</InputLabel>
            <Select
              labelId="package-select-label"
              name="package_id"
              value={activePackageDetails.package_id}
              label="Pacote Ativo"
              onChange={handlePackageChange}
            >
              <MenuItem value=""><em>Nenhum / Avulsa</em></MenuItem>
              {packages.map(pkg => (
                <MenuItem key={pkg.id} value={pkg.id}>{pkg.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Validade do Pacote"
            name="validity_date"
            type="date"
            value={activePackageDetails.validity_date}
            onChange={handleValidityChange}
            InputLabelProps={{ shrink: true }}
            disabled={!activePackageDetails.package_id}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setError(null); }}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained">Salvar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteDialog} onClose={handleDeleteCancel}>
        <DialogTitle>Remover Cliente</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{mb:2, width: '100%'}}>{error}</Alert>}
          <Typography>
            Tem certeza que deseja remover o cliente <strong>{clientToDelete?.name}</strong>?
            Todos os pacotes e sessões associados a este cliente também serão removidos. Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancelar</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">Remover</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}