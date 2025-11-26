-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 25, 2025 at 05:05 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `gh-itenas`
--

-- --------------------------------------------------------

--
-- Table structure for table `greenhouses`
--

CREATE TABLE `greenhouses` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `location` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `greenhouses`
--

INSERT INTO `greenhouses` (`id`, `name`, `location`, `created_at`) VALUES
(1, 'Greenhouse 1', 'Belakang Itenas', '2025-11-18 16:34:49'),
(2, 'Greenhouse 2', 'Belakang Itenas', '2025-11-18 16:34:49');

-- --------------------------------------------------------

--
-- Table structure for table `historical_data`
--

CREATE TABLE `historical_data` (
  `id` int(11) NOT NULL,
  `greenhouse_id` int(11) NOT NULL,
  `dht_temp` float DEFAULT NULL,
  `dht_hum` float DEFAULT NULL,
  `turbidity` float DEFAULT NULL,
  `water_temp` float DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `realtime_data`
--

CREATE TABLE `realtime_data` (
  `id` int(11) NOT NULL,
  `greenhouse_id` int(11) NOT NULL,
  `dht_temp` float DEFAULT NULL,
  `dht_hum` float DEFAULT NULL,
  `turbidity` float DEFAULT NULL,
  `water_temp` float DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `greenhouses`
--
ALTER TABLE `greenhouses`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `historical_data`
--
ALTER TABLE `historical_data`
  ADD PRIMARY KEY (`id`),
  ADD KEY `greenhouse_id` (`greenhouse_id`),
  ADD KEY `created_at` (`created_at`);

--
-- Indexes for table `realtime_data`
--
ALTER TABLE `realtime_data`
  ADD PRIMARY KEY (`id`),
  ADD KEY `greenhouse_id` (`greenhouse_id`),
  ADD KEY `created_at` (`created_at`);

--
-- Constraints for dumped tables
--

--
-- Constraints for table `historical_data`
--
ALTER TABLE `historical_data`
  ADD CONSTRAINT `fk_sensor_greenhouse` FOREIGN KEY (`greenhouse_id`) REFERENCES `greenhouses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `realtime_data`
--
ALTER TABLE `realtime_data`
  ADD CONSTRAINT `realtime_data_ibfk_1` FOREIGN KEY (`greenhouse_id`) REFERENCES `greenhouses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
