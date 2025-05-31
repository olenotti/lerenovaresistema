import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Snackbar,
  Alert,
  Paper,
  Container,
  Avatar
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
// import loginBackground from '../assets/AdobeStock_180837298.jpeg'; // Opção 1: Se a imagem estiver em src/assets

// Opção 2: Se a imagem estiver na pasta public (ex: public/AdobeStock_180837298.jpeg)
const loginBackgroundImageUrl = `${process.env.PUBLIC_URL}/AdobeStock_180837298.jpeg`; // Ajuste o caminho se moveu para uma subpasta como /images/

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ open: false, message: '', severity: 'info' });

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setFeedback({ open: false, message: '', severity: 'info' });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        setFeedback({ open: true, message: error.message || 'Falha no login. Verifique suas credenciais.', severity: 'error' });
      } else if (data.user) {
        // Login successful, App.js onAuthStateChange will handle the session update and redirect.
        // Você poderia mostrar uma mensagem breve de sucesso aqui se desejado,
        // mas geralmente não é necessário, pois o aplicativo fará a transição.
      } else {
        setFeedback({ open: true, message: 'Resposta inesperada do servidor.', severity: 'warning' });
      }
    } catch (error) {
      setFeedback({ open: true, message: 'Ocorreu um erro inesperado. Tente novamente.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setFeedback(prev => ({ ...prev, open: false }));
  };

  return (
    <Box // Este Box será o container para o background
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative', // Para o overlay
        '&::before': { // Pseudo-elemento para o background e overlay
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url(${loginBackgroundImageUrl})`, // Usando a variável da URL
          // backgroundImage: `url(${loginBackground})`, // Opção 1: Se importou de src/assets
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: 'brightness(0.4)', // Ajuste o brilho para escurecer (0.4 = 40% de brilho)
          zIndex: -1, // Coloca o pseudo-elemento atrás do conteúdo
        }
      }}
    >
      <Container component="main" maxWidth="xs" sx={{ zIndex: 1 }}> {/* Garante que o container fique na frente */}
        <Paper
          elevation={6} // Aumenta a elevação para destacar mais sobre o fundo escuro
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: { xs: 3, sm: 4 }, // Ajusta o padding
            borderRadius: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.15)', // Quase transparente. Ajuste o valor alpha (0.15) conforme necessário
            backdropFilter: 'blur(5px)', // Opcional: adiciona um leve desfoque ao fundo do Paper
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: 'primary.main' }}>
            <LockOutlinedIcon />
          </Avatar>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold', mb:2, color: 'white' /* Ajuste a cor do texto para melhor contraste */ }}>
            Le Renovare - Gestão
          </Typography>
          <Box component="form" onSubmit={handleLogin} noValidate sx={{ mt: 1, width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              variant="filled"
              InputLabelProps={{
                style: { color: '#e0e0e0' }, // Cor mais clara para o label do TextField
              }}
              InputProps={{
                style: { color: 'white' }, // Cor do texto digitado
                sx: { backgroundColor: 'rgba(0, 0, 0, 0.2)'} // Fundo levemente escuro para os TextFields
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Senha"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              variant="filled"
              InputLabelProps={{
                style: { color: '#e0e0e0' }, // Cor mais clara para o label do TextField
              }}
              InputProps={{
                style: { color: 'white' }, // Cor do texto digitado
                sx: { backgroundColor: 'rgba(0, 0, 0, 0.2)'} // Fundo levemente escuro para os TextFields
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2, py: 1.5 }} // Aumenta um pouco o padding do botão
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Entrar'}
            </Button>
          </Box>
        </Paper>
      </Container>
      <Snackbar
        open={feedback.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={feedback.severity} sx={{ width: '100%' }} variant="filled">
          {feedback.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}