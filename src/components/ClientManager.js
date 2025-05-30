import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, CircularProgress, Alert
} from "@mui/material";
import { supabase } from '../supabaseClient'; // Importe o cliente Supabase

// Função para obter a data atual no formato YYYY-MM-DD
const getCurrentDate = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0'); // Janeiro é 0!
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Função para formatar data de YYYY-MM-DD para DD-MM-YYYY (ou como preferir)
const formatDateForDisplay = (dateString) => {
  if (!dateString) return "-";
  const [year, month, day] = dateString.split('-');
  return `${day}-${month}-${year}`;
};

// Função para formatar data de DD-MM para exibição (aniversário)
const formatBirthdayForDisplay = (birthday) => {
  if (!birthday || birthday.length !== 5 || birthday[2] !== '-') return "-";
  return birthday;
};

// Função para converter DD-MM para um formato que o input date possa entender (se necessário)
// ou manter como string se o banco de dados armazena como texto.
// Para este exemplo, vamos assumir que 'birthday' é armazenado como TEXT 'DD-MM'.

function emptyClient() {
  return {
    id: null,
    name: "",
    email: "",
    phone: "",
    birthday: "", // Formato DD-MM
    notes: "",
    // Os campos 'package', 'packageValidity', 'packageSession' serão gerenciados
    // através da tabela 'client_packages' e do estado 'activePackageDetails'
  };
}

// Função para verificar se um pacote está expirado (simplificada)
// Você pode querer uma lógica mais robusta aqui, considerando sessões, etc.
const isPackageExpired = (pkg) => {
  if (!pkg || !pkg.validity_date) return true; // Se não tem data de validade, considera expirado ou inválido
  return new Date(pkg.validity_date) < new Date();
};

export default function ClientManager() {
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]); // Lista de pacotes disponíveis
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState(emptyClient());
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estado para gerenciar o pacote ativo do cliente no formulário
  const [activePackageDetails, setActivePackageDetails] = useState({
    package_id: '',
    validity_date: '',
  });

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          client_packages (
            id,
            package_id,
            package_name,
            start_date,
            validity_date,
            sessions_used,
            total_sessions,
            status
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error.message);
      setError('Falha ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPackages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('packages')
        .select('*')
        .order('name');
      if (error) throw error;
      setPackages(data || []);
    } catch (error) {
      console.error('Erro ao buscar pacotes:', error.message);
      // Poderia definir um estado de erro para pacotes também
    }
  }, []);

  useEffect(() => {
    if (supabase) {
      fetchClients();
      fetchPackages();
    }
  }, [fetchClients, fetchPackages]);

  const getActiveClientPackage = (client) => {
    if (!client.client_packages || client.client_packages.length === 0) return null;
    // Encontra o primeiro pacote que não está expirado
    // Você pode querer uma lógica mais sofisticada aqui, ex: o mais recente ativo
    return client.client_packages.find(pkg => !isPackageExpired(pkg) && pkg.status === 'active') || null;
  };

  const getPackageDisplay = (client) => {
    const activePkg = getActiveClientPackage(client);
    return activePkg ? activePkg.package_name : "-";
  };

  

  const getValidityDisplay = (client) => {
    const activePkg = getActiveClientPackage(client);
    return activePkg && activePkg.validity_date ? formatDateForDisplay(activePkg.validity_date) : "-";
  };

  const handleOpen = (c = null) => {
    setError(null);
    if (c) {
      setClient({ ...emptyClient(), ...c });
      const activePkg = getActiveClientPackage(c);
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
    setClient({ ...client, [name]: value });
  };

  const handlePackageChange = (e) => {
    const selectedPackageId = e.target.value;
    const selectedPackage = packages.find(p => p.id === selectedPackageId);

    setActivePackageDetails(prev => ({
      ...prev,
      package_id: selectedPackageId,
      // Se um pacote for selecionado e não houver data de validade,
      // você pode querer definir uma padrão ou deixar em branco para o usuário preencher.
      // validity_date: selectedPackage && !prev.validity_date ? calcularDataValidade(selectedPackage.duration_days) : prev.validity_date,
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
    setError(null); // Limpa erros anteriores

    // Validação de e-mail duplicado ANTES de tentar salvar
    if (client.email) {
      // Se estiver editando, não compare o e-mail com o do próprio cliente
      let query = supabase
        .from('clients')
        .select('id')
        .eq('email', client.email);

      if (client.id) { // Se client.id existe, estamos editando
        query = query.not('id', 'eq', client.id);
      }
      
      const { data: existingEmail, error: emailError } = await query.maybeSingle();

      if (emailError && emailError.code !== 'PGRST116') { // PGRST116: No rows found, o que é bom
        console.error('Erro ao verificar e-mail:', emailError);
        setError('Erro ao verificar e-mail. Tente novamente.');
        return;
      }
      if (existingEmail) {
        setError('Este e-mail já está em uso por outro cliente.');
        return;
      }
    }

    const clientData = {
      name: client.name,
      email: client.email || null, // Garante null se vazio, caso a coluna não permita string vazia
      phone: client.phone || null,
      birthday: client.birthday || null,
      notes: client.notes || null,
    };

    try {
      let savedClient;
      if (client.id) { // Atualizar cliente existente
        const { data, error: updateError } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', client.id)
          .select() // Adicionado para retornar o cliente atualizado
          .single(); 
        if (updateError) throw updateError;
        savedClient = data;
      } else { // Criar novo cliente
        const { data, error: insertError } = await supabase
          .from('clients')
          .insert([clientData])
          .select() // Adicionado para retornar o cliente inserido
          .single(); 
        if (insertError) throw insertError;
        savedClient = data;
      }

      // Gerenciar o pacote do cliente
      if (savedClient && activePackageDetails.package_id) {
        const selectedPackage = packages.find(p => p.id === activePackageDetails.package_id);
        const clientPackageData = {
          client_id: savedClient.id,
          package_id: activePackageDetails.package_id,
          package_name: selectedPackage?.name,
          validity_date: activePackageDetails.validity_date || null,
          start_date: getCurrentDate(),
          total_sessions: selectedPackage?.total_sessions,
          status: 'active',
        };

        const existingActivePackage = client.client_packages?.find(
          (p) => p.package_id === clientPackageData.package_id && p.status === 'active'
        );

        if (existingActivePackage) {
          // Atualiza o pacote existente se a validade mudou
           if (existingActivePackage.validity_date !== clientPackageData.validity_date) {
            const { error: updatePkgError } = await supabase
              .from('client_packages')
              .update({ validity_date: clientPackageData.validity_date })
              .eq('id', existingActivePackage.id);
            if (updatePkgError) throw updatePkgError;
          }
        } else {
          // Se não há um pacote ativo com o mesmo package_id, desativa os outros e insere o novo
          const currentActivePackages = client.client_packages?.filter(p => p.status === 'active');
          if (currentActivePackages) {
            for (const pkg of currentActivePackages) {
              await supabase.from('client_packages').update({ status: 'inactive' }).eq('id', pkg.id);
            }
          }
          const { error: insertPkgError } = await supabase
            .from('client_packages')
            .insert([clientPackageData]);
          if (insertPkgError) throw insertPkgError;
        }
      } else if (savedClient && !activePackageDetails.package_id) {
        // Se "Nenhum" pacote foi selecionado, desativar pacotes ativos existentes
        const activeClientPackages = client.client_packages?.filter(p => p.status === 'active');
        if (activeClientPackages) {
          for (const pkg of activeClientPackages) {
            const { error: updateError } = await supabase
              .from('client_packages')
              .update({ status: 'inactive' }) // Ou 'expired', ou data de validade para o passado
              .eq('id', pkg.id);
            if (updateError) {
              console.warn(`Falha ao desativar pacote antigo ${pkg.id}:`, updateError.message);
            }
          }
        }
      }

      fetchClients(); // Recarregar a lista de clientes
      setOpen(false);
      setClient(emptyClient());
      setActivePackageDetails({ package_id: '', validity_date: '' });
    } catch (error) {
      console.error('Erro ao salvar cliente:', error.message);
      // Verifica se o erro é de chave duplicada, mesmo com a verificação anterior (caso de condição de corrida rara)
      if (error.message.includes("clients_email_key")) {
        setError("Este e-mail já está em uso. Por favor, utilize outro.");
      } else {
        setError(`Erro ao salvar cliente: ${error.message}`);
      }
    }
  };

  const handleDeleteClick = (c) => {
    setClientToDelete(c);
    setDeleteDialog(true);
  };

  

  const handleDeleteConfirm = async () => {
    if (clientToDelete && supabase) {
      try {
        const { error } = await supabase
          .from('clients')
          .delete()
          .eq('id', clientToDelete.id);

        if (error) throw error;

        setClients(clients.filter(c => c.id !== clientToDelete.id));
        setDeleteDialog(false);
        setClientToDelete(null);
      } catch (error) {
        console.error('Erro ao remover cliente:', error.message);
        setError(`Erro ao remover cliente: ${error.message}`);
        setDeleteDialog(false); // Fechar o diálogo mesmo em caso de erro
      }
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialog(false);
    setClientToDelete(null);
  };

  if (loading) {
    return <CircularProgress />;
  }

  if (error && !open) { // Não mostrar erro geral se o modal de edição/criação estiver aberto
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Gerenciar Clientes</Typography>
      <Button variant="contained" sx={{ mb: 2 }} onClick={() => handleOpen()}>Novo Cliente</Button>
      {error && open && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Telefone</TableCell>
            <TableCell>Aniversário</TableCell>
            <TableCell>Pacote Ativo</TableCell>
            <TableCell>Validade</TableCell>
            <TableCell>Ações</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {clients.map(c => (
            <TableRow key={c.id}>
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
        </TableBody>
      </Table>

      {/* Dialog de Adição/Edição */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{client.id ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: '20px !important' }}>
          <TextField
            label="Nome"
            name="name"
            value={client.name}
            onChange={handleChange}
            autoFocus
            fullWidth
            required
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={client.email}
            onChange={handleChange}
            fullWidth
          />
          <TextField
            label="Telefone"
            name="phone"
            value={client.phone}
            onChange={handleChange}
            fullWidth
          />
          <TextField
            label="Aniversário (DD-MM)"
            name="birthday"
            value={client.birthday}
            onChange={handleChange}
            placeholder="ex: 24-08"
            inputProps={{ maxLength: 5 }}
            fullWidth
          />
          <TextField
            label="Observações"
            name="notes"
            value={client.notes}
            onChange={handleChange}
            multiline
            rows={3}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel id="package-select-label">Pacote Ativo</InputLabel>
            <Select
              labelId="package-select-label"
              name="package_id" // Nome do campo no estado activePackageDetails
              value={activePackageDetails.package_id}
              label="Pacote Ativo"
              onChange={handlePackageChange}
            >
              <MenuItem value="">
                <em>Nenhum</em>
              </MenuItem>
              {packages.map(pkg => (
                <MenuItem key={pkg.id} value={pkg.id}>{pkg.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Validade do Pacote"
            name="validity_date" // Nome do campo no estado activePackageDetails
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

      {/* Dialog de Remoção */}
      <Dialog open={deleteDialog} onClose={handleDeleteCancel}>
        <DialogTitle>Remover Cliente</DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja remover o cliente <strong>{clientToDelete?.name}</strong>? Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancelar</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">Remover</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}