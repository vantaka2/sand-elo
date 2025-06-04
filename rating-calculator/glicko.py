"""
Glicko-2 Rating System Implementation
Based on Mark Glickman's Glicko-2 rating system
"""
import math
from typing import Tuple


class GlickoCalculator:
    """Glicko-2 rating calculator for beach volleyball ratings."""
    
    def __init__(self, tau: float = 0.5):
        """
        Initialize the Glicko calculator.
        
        Args:
            tau: System constant (volatility change rate, typically 0.3-1.2)
        """
        self.tau = tau
        self.epsilon = 0.000001  # Convergence tolerance
    
    def rating_to_glicko2(self, rating: float, rd: float) -> Tuple[float, float]:
        """Convert rating and RD to Glicko-2 scale."""
        mu = (rating - 1500) / 173.7178
        phi = rd / 173.7178
        return mu, phi
    
    def glicko2_to_rating(self, mu: float, phi: float) -> Tuple[int, int]:
        """Convert Glicko-2 scale back to rating and RD."""
        rating = mu * 173.7178 + 1500
        rd = phi * 173.7178
        
        # Clamp values to reasonable ranges and round to integers
        rating = max(100, min(3000, round(rating)))
        rd = max(30, min(350, round(rd)))
        
        return rating, rd
    
    def g(self, phi: float) -> float:
        """Calculate g(φ) function."""
        return 1 / math.sqrt(1 + 3 * phi * phi / (math.pi * math.pi))
    
    def expected_score(self, mu: float, mu_j: float, phi_j: float) -> float:
        """Calculate expected score E(s|μ,μⱼ,φⱼ)."""
        return 1 / (1 + math.exp(-self.g(phi_j) * (mu - mu_j)))
    
    def calculate_new_rating(
        self, 
        rating: float, 
        rd: float, 
        volatility: float,
        opponent_rating: float, 
        opponent_rd: float, 
        score: float
    ) -> Tuple[int, int, float]:
        """
        Calculate new rating after a match.
        
        Args:
            rating: Current rating
            rd: Current rating deviation
            volatility: Current volatility
            opponent_rating: Opponent's rating
            opponent_rd: Opponent's rating deviation
            score: Match score (1.0 for win, 0.0 for loss, 0.5 for draw)
            
        Returns:
            Tuple of (new_rating, new_rd, new_volatility)
        """
        # Convert to Glicko-2 scale
        mu, phi = self.rating_to_glicko2(rating, rd)
        mu_j, phi_j = self.rating_to_glicko2(opponent_rating, opponent_rd)
        
        # Calculate variance
        g_phi_j = self.g(phi_j)
        expected = self.expected_score(mu, mu_j, phi_j)
        variance = 1 / (g_phi_j * g_phi_j * expected * (1 - expected))
        
        # Calculate improvement delta
        delta = variance * g_phi_j * (score - expected)
        
        # Update volatility (simplified - using constant volatility for performance)
        new_volatility = volatility
        
        # Calculate new phi
        phi_star = math.sqrt(phi * phi + new_volatility * new_volatility)
        new_phi = 1 / math.sqrt(1 / (phi_star * phi_star) + 1 / variance)
        
        # Calculate new mu
        new_mu = mu + new_phi * new_phi * g_phi_j * (score - expected)
        
        # Convert back to regular scale
        new_rating, new_rd = self.glicko2_to_rating(new_mu, new_phi)
        
        return new_rating, new_rd, new_volatility


def calculate_team_rating_change(
    p1_rating: float, p1_rd: float,
    p2_rating: float, p2_rd: float,
    opp_team_rating: float, opp_team_rd: float,
    team_score: float,
    calculator: GlickoCalculator,
    volatility: float = 0.06
) -> Tuple[Tuple[int, int], Tuple[int, int]]:
    """
    Calculate rating changes for both players on a team.
    
    Returns:
        ((p1_new_rating, p1_new_rd), (p2_new_rating, p2_new_rd))
    """
    # Calculate new ratings for both players against the opposing team
    p1_new_rating, p1_new_rd, _ = calculator.calculate_new_rating(
        p1_rating, p1_rd, volatility, opp_team_rating, opp_team_rd, team_score
    )
    
    p2_new_rating, p2_new_rd, _ = calculator.calculate_new_rating(
        p2_rating, p2_rd, volatility, opp_team_rating, opp_team_rd, team_score
    )
    
    return (p1_new_rating, p1_new_rd), (p2_new_rating, p2_new_rd)


def calculate_team_average_rating(p1_rating: float, p1_rd: float, p2_rating: float, p2_rd: float) -> Tuple[float, float]:
    """Calculate team's average rating and combined RD."""
    team_rating = (p1_rating + p2_rating) / 2
    team_rd = math.sqrt((p1_rd * p1_rd + p2_rd * p2_rd) / 2)
    return team_rating, team_rd